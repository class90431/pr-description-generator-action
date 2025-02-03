import { Octokit } from 'octokit'
import OpenAI from 'openai'

// 讀取 GitHub Actions 傳遞的 inputs
const owner = process.env.INPUT_REPOSITORY_OWNER
const repo = process.env.INPUT_REPOSITORY_NAME
const pullNumber = process.env.INPUT_PULL_REQUEST_NUMBER
const branchName = process.env.INPUT_BRANCH_NAME

// 讀取 secrets
const openaiApiKey = process.env.SECRET_OPENAI_API_KEY
const githubToken = process.env.SECRET_GITHUB_TOKEN

if (!openaiApiKey || !githubToken) {
  console.error("Missing required secrets: OPENAI_API_KEY or GITHUB_TOKEN")
  process.exit(1)
}

// 初始化 OpenAI API
const openai = new OpenAI({ apiKey: openaiApiKey })

// 初始化 GitHub API
const octokit = new Octokit({ auth: githubToken })

console.log(`Generating PR description for ${owner}/${repo} #${pullNumber} / ${branchName}`)

// 你的 OpenAI + GitHub API 處理邏輯...
