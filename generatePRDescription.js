import dotenv from 'dotenv'
dotenv.config()

import { Octokit } from 'octokit'
import OpenAI from 'openai'

console.log('======', process.env.MY_GITHUB_TOKEN)
console.log('======', process.env.OPENAI_API_KEY)

// init OpenAIApi
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

console.log('=== openai ===', openai)

// init GitHub API
const octokit = new Octokit({ auth: process.env.MY_GITHUB_TOKEN })

// auto generate PR description
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
          accept: 'application/vnd.github.v3.diff' // 或 'application/vnd.github.v3.patch'
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

    const prDescription = response.choices[0].message.content.trim()

    // Update PR description
    await octokit.rest.pulls.update({
      owner,
      repo,
      pull_number: pullNumber,
      body: prDescription
    })

    console.log('PR description updated successfully!')
  } catch (error) {
    console.error('Error generating PR description:', error.message)
    process.exit(1)
  }
}

// Get input parameters from GitHub Actions
const [owner, repo, pullNumber, branchName] = process.argv.slice(2)

// Validate input parameters
if (!owner || !repo || !pullNumber || !branchName) {
  console.error(
    'Error: Missing required parameters: owner, repo, pull_number, branch_name'
  )
  process.exit(1)
}

generatePRDescription(owner, repo, pullNumber, branchName)
