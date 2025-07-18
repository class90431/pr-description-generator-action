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
    const jiraTicket = jiraTicketMatch ? jiraTicketMatch[0] : null
    const jiraURL = jiraTicket ? `https://botrista-sw.atlassian.net/browse/${jiraTicket}` : null

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
    // Get existing PR description
    const existingDescription = pr.body ? pr.body.trim() : ''

    if (existingDescription.includes('<!-- [gen-skip] -->')) {
      console.log('PR description already generated, skipping...')
      return
    }

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

    // Check if existing description already has sections
    const hasDescription = existingDescription.includes('## Description')
    const hasChanges = existingDescription.includes('## Changes')
    const hasTest = existingDescription.includes('## Test')
    const hasApi = existingDescription.includes('## API')
    
    // Extract existing content from sections if they exist
    let existingDescriptionContent = ''
    let existingChangesContent = ''
    let existingTestContent = ''
    let existingApiContent = ''
    
    if (hasDescription) {
      const descriptionMatch = existingDescription.match(/## Description\s*([\s\S]*?)(?=##|$)/)
      existingDescriptionContent = descriptionMatch ? descriptionMatch[1].trim() : ''
    }
    
    if (hasChanges) {
      const changesMatch = existingDescription.match(/## Changes\s*([\s\S]*?)(?=##|$)/)
      existingChangesContent = changesMatch ? changesMatch[1].trim() : ''
    }
    
    if (hasTest) {
      const testMatch = existingDescription.match(/## Test\s*([\s\S]*?)(?=##|$)/)
      existingTestContent = testMatch ? testMatch[1].trim() : ''
    }
    
    if (hasApi) {
      const apiMatch = existingDescription.match(/## API\s*([\s\S]*?)(?=##|$)/)
      existingApiContent = apiMatch ? apiMatch[1].trim() : ''
    }

    // Check if API changes are likely present in the code
    const hasApiChanges = files.some(f => {
      // Check if file is likely to contain API definitions
      const isApiFile = f.filename.includes('api') || 
                        f.filename.includes('route') || 
                        f.filename.includes('controller') ||
                        f.filename.includes('endpoint');
      
      // Check if diff contains API-related keywords
      const containsApiKeywords = diff.includes('app.get(') || 
                                 diff.includes('app.post(') || 
                                 diff.includes('app.put(') || 
                                 diff.includes('app.delete(') ||
                                 diff.includes('router.get(') ||
                                 diff.includes('router.post(') ||
                                 diff.includes('router.put(') ||
                                 diff.includes('router.delete(') ||
                                 diff.includes('@api') ||
                                 diff.includes('fetch(') ||
                                 diff.includes('axios.');
      
      return isApiFile || containsApiKeywords;
    });

    // Define base template with existing content if available
    let template = `
## Description
${existingDescriptionContent || '<!-- Replace this line to describe what this PR does -->'}

## Changes
${existingChangesContent || '<!-- Replace this line to list changes -->'}
`;

    // Add API section if needed
    if (hasApi || hasApiChanges) {
      template += `
## API
${existingApiContent || '- [GET] XXXXXXX'}

`;
    }

    // Add Test section
    template += `## Test
${existingTestContent || '<!-- Replace this line to explain how to test -->'}
`;

    // Only add Ticket section if a Jira ticket was found
    if (jiraTicket) {
      template += `
## Ticket
[${jiraTicket}](${jiraURL})
    `;
    }

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

IMPORTANT INSTRUCTIONS:
- If there is existing content in the Description or Changes sections, understand it and incorporate it into your response.
- Do not duplicate information that's already present in the existing content.
- Add new information that complements what's already there.
${hasChanges ? '- The existing PR description already has a ## Changes section. Add your new changes as bullet points under the existing ## Changes section.' : ''}
${hasDescription ? '- Keep the existing ## Description section and enhance it if needed.' : ''}
${hasTest ? '- Keep the existing ## Test section and enhance it if needed.' : ''}
${hasApi ? '- Keep the existing ## API section and enhance it if needed.' : ''}
${!hasApi && hasApiChanges ? '- Include the ## API section with details about API changes, following the format [METHOD] endpoint.' : ''}
${!hasApi && !hasApiChanges ? '- Remove the ## API section completely if there are no API changes.' : ''}
    `

    // Generate PR description with OpenAI
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are a helpful assistant for generating PR descriptions. If the PR already has sections, enhance them instead of creating new ones. When you see existing content in the Description or Changes sections, carefully analyze and understand it, then incorporate it into your response while adding complementary information.'
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

    // Process the new description
    let finalDescription = newPrDescription
    
    // If there's an existing description and it contains sections,
    // we need to intelligently merge rather than just append
    if (existingDescription && (hasDescription || hasChanges || hasTest || hasApi)) {
      // Use the new description directly as it should have incorporated
      // the existing content based on our instructions to the model
      finalDescription = newPrDescription
    } else if (existingDescription) {
      // Check if the existing description has any content that doesn't fit into our sections
      // If it does, we want to preserve it at the top of the PR description
      const existingSectionsPattern = /##\s+(Description|Changes|Test|API|Ticket)/i
      if (!existingSectionsPattern.test(existingDescription)) {
        // If there's an existing description but no structured sections,
        // prepend it to the new content with a separator
        const separator = '\n\n---\n\n'
        finalDescription = `${existingDescription}${separator}${newPrDescription}`
      } else {
        // If there are some sections but not all, the model should have incorporated them
        finalDescription = newPrDescription
      }
    }

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
