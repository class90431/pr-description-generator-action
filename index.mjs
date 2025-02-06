import { Octokit } from 'octokit'
import OpenAI from 'openai'

// Read inputs from GitHub Actions
const owner = process.env.INPUT_REPOSITORY_OWNER
const repo = process.env.INPUT_REPOSITORY_NAME
const pullNumber = process.env.INPUT_PULL_REQUEST_NUMBER
const branchName = process.env.INPUT_BRANCH_NAME

// Read secrets
const openaiApiKey = process.env.OPENAI_API_KEY
const githubToken = process.env.GITHUB_TOKEN

// Check if secrets exist
if (!openaiApiKey || !githubToken) {
  console.error('Missing required secrets: OPENAI_API_KEY or GITHUB_TOKEN')
  process.exit(1)
}

// Initialize OpenAI
const openai = new OpenAI({ apiKey: openaiApiKey })

// Initialize GitHub API
const octokit = new Octokit({ auth: githubToken })

console.log(
  `Generating PR description for ${owner}/${repo}#${pullNumber} (${branchName})`
)

async function generatePRDescription(owner, repo, pullNumber, branchName) {
  try {
    // Extract Jira Ticket from branch name
    const jiraTicketMatch = branchName.match(/(CDB|DBP)-\d+/)
    const jiraTicket = jiraTicketMatch ? jiraTicketMatch[0] : 'CDB-0000'
    const jiraURL = `https://botrista-sw.atlassian.net/browse/${jiraTicket}`

    // Fetch PR commits and changed files
    const [{ data: commits }, { data: files }, { data: pr }] =
      await Promise.all([
        octokit.rest.pulls.listCommits({
          owner,
          repo,
          pull_number: pullNumber
        }),
        octokit.rest.pulls.listFiles({ owner, repo, pull_number: pullNumber }),
        octokit.rest.pulls.get({ owner, repo, pull_number: pullNumber })
      ])

    // Extract commit messages and file changes
    const commitMessages = commits
      .map((c) => `- ${c.commit.message}`)
      .join('\n')
    const fileChanges = files
      .map((f) => `- ${f.filename} (${f.status})`)
      .join('\n')

    // Fetch PR diff (with a size limit)
    let diff = ''
    try {
      const { data: rawDiff } = await octokit.request(
        `GET /repos/{owner}/{repo}/pulls/{pull_number}`,
        {
          owner,
          repo,
          pull_number: pullNumber,
          headers: { accept: 'application/vnd.github.v3.diff' }
        }
      )
      diff =
        rawDiff.length > 20000
          ? rawDiff.slice(0, 20000) + '\n\n[Diff truncated]'
          : rawDiff
    } catch (err) {
      console.warn('Warning: Unable to fetch diff, proceeding without it.')
    }

    // Get existing PR description
    const existingDescription = pr.body ? pr.body.trim() : ''

    // Define PR template
    const template = `
## Description
<!-- Replace this line to describe what this PR does -->

## Changes
<!-- Replace this line to list changes -->

## Test
<!-- Replace this line to explain how to test -->

## Ticket
[${jiraTicket}](${jiraURL})
    `

    // Prepare OpenAI prompt
    const prompt = `
Generate a GitHub pull request description based on the following details:

Existing PR description:
${existingDescription || '(No existing description)'}

Commit messages:
${commitMessages}

File changes:
${fileChanges}

Code diff (truncated if too long):
${diff}

Format the description using this template:
${template}
    `

    // Generate PR description with OpenAI
    const response = await openai.chat.completions.create({
      model: 'gpt-4-turbo',
      messages: [
        {
          role: 'system',
          content: 'You are a helpful assistant for generating PR descriptions.'
        },
        { role: 'user', content: prompt }
      ],
      max_tokens: 4096
    })

    const newPrDescription = response.choices[0]?.message?.content?.trim() || ''

    if (!newPrDescription) {
      console.error('Error: OpenAI returned an empty response.')
      process.exit(1)
    }

    // Append new content to existing PR description
    const separator = '\n\n---\n\n'
    const finalDescription = existingDescription
      ? `${existingDescription}${separator}${newPrDescription}`
      : newPrDescription

    // Update PR description on GitHub
    await octokit.rest.pulls.update({
      owner,
      repo,
      pull_number: pullNumber,
      body: finalDescription
    })

    console.log('PR description updated successfully!')
  } catch (error) {
    console.error('Error generating PR description:', error.message)
    process.exit(1)
  }
}

generatePRDescription(owner, repo, pullNumber, branchName)
