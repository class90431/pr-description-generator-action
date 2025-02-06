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
  `Generating PR description for ${owner}/${repo}#${pullNumber}/${branchName}`
)

async function generatePRDescription(owner, repo, pullNumber, branchName) {
  try {
    // Get Jira Ticket (Support CDB-xxxx and DBP-xxxx)
    const jiraTicketMatch = branchName.match(/(CDB|DBP)-\d+/)
    const jiraTicket = jiraTicketMatch ? jiraTicketMatch[0] : 'CDB-0000'

    // Create Jira URL
    const jiraURL = `https://botrista-sw.atlassian.net/browse/${jiraTicket}`

    // Get PR commits and changes
    const { data: commits } = await octokit.rest.pulls.listCommits({
      owner,
      repo,
      pull_number: pullNumber
    })
    const { data: files } = await octokit.rest.pulls.listFiles({
      owner,
      repo,
      pull_number: pullNumber
    })

    // Get PR's code diff
    const { data: diff } = await octokit.request(
      `GET /repos/{owner}/{repo}/pulls/{pull_number}`,
      {
        owner,
        repo,
        pull_number: pullNumber,
        headers: {
          accept: 'application/vnd.github.v3.diff'
        }
      }
    )

    // Extract commit messages and file changes
    const commitMessages = commits
      .map((commit) => `- ${commit.commit.message}`)
      .join('\n')
    const fileChanges = files
      .map((file) => `- ${file.filename} (${file.status})`)
      .join('\n')

    console.log('Commit messages:', commitMessages)
    console.log('File changes:', fileChanges)
    console.log('Code diff:', diff)

    // Prepare prompt for OpenAI
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

    const prompt = `
Generate a GitHub pull request description based on the following details:

Commit messages:
${commitMessages}

File changes:
${fileChanges}

Code diff:
${diff}

Format the description with the following template:
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
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: 4096
    })

    // Get PR details (including current description)
    const { data: pr } = await octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: pullNumber
    })

    const existingDescription = pr.body ? pr.body.trim() : ''

    const newPrDescription = response.choices[0].message.content.trim()

    // If PR already has content, append the new content with a separator
    const separator = '\n\n---\n\n'
    const finalDescription = existingDescription
      ? `${existingDescription}${separator}${newPrDescription}`
      : newPrDescription

    // Update PR description
    await octokit.rest.pulls.update({
      owner,
      repo,
      pull_number: pullNumber,
      body: finalDescription
    })

    console.log('PR description updated successfully!')
  } catch (error) {
    console.error('Error generating PR description:', error.message)
    console.error('Error:', error)
    process.exit(1)
  }
}

generatePRDescription(owner, repo, pullNumber, branchName)
