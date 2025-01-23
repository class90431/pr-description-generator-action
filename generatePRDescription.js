import dotenv from 'dotenv';
dotenv.config();

import { Octokit } from 'octokit';
import OpenAI from 'openai';

// 初始化 OpenAIApi
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// 初始化 GitHub API
const octokit = new Octokit({ auth: process.env.MY_GITHUB_TOKEN });

// 自動生成 PR 描述
async function generatePRDescription(owner, repo, pullNumber) {
  try {
    // 獲取 PR 的提交和變更資訊
    const { data: commits } = await octokit.rest.pulls.listCommits({
      owner,
      repo,
      pull_number: pullNumber,
    });
    const { data: files } = await octokit.rest.pulls.listFiles({
      owner,
      repo,
      pull_number: pullNumber,
    });

    // 獲取 PR 的 code diff
    const { data: diff } = await octokit.request(`GET /repos/{owner}/{repo}/pulls/{pull_number}`, {
      owner,
      repo,
      pull_number: pullNumber,
      headers: {
        accept: 'application/vnd.github.v3.diff', // 或 'application/vnd.github.v3.patch'
      },
    });

    // 提取提交訊息和文件變更
    const commitMessages = commits
      .map((commit) => `- ${commit.commit.message}`)
      .join('\n');
    const fileChanges = files
      .map((file) => `- ${file.filename} (${file.status})`)
      .join('\n');

    console.log('Commit messages:', commitMessages);
    console.log('File changes:', fileChanges);
    console.log('Code diff:', diff); // 如果需要，這裡可以查看 diff 資料

    // 準備提示文字給 OpenAI
    const template = `
## Description
<!-- Replace this line to describe what this PR does -->

## Changes
<!-- Replace this line to list changes -->

## Test
<!-- Replace this line to explain how to test -->

## Ticket
[CDB-0000](https://botrista-sw.atlassian.net/browse/CDB-0000)
    `;

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
    `;

    // 使用 OpenAI 生成描述
    const response = await openai.chat.completions.create({
      model: 'gpt-4-turbo',
      messages: [
        {
          role: 'system',
          content: 'You are a helpful assistant for generating PR descriptions.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      max_tokens: 4096,
    });

    const prDescription = response.choices[0].message.content.trim();

    // 更新 PR 描述
    await octokit.rest.pulls.update({
      owner,
      repo,
      pull_number: pullNumber,
      body: prDescription,
    });

    console.log('PR description updated successfully!');
  } catch (error) {
    // 輸出錯誤訊息
    console.error('Error generating PR description:', error.message);
  }
}

// 從 GitHub Actions 中獲取輸入參數
const [owner, repo, pullNumber] = process.argv.slice(2);

// 驗證參數是否完整
if (!owner || !repo || !pullNumber) {
  console.error('Error: Missing required parameters: owner, repo, pull_number');
  process.exit(1);
}

// 生成 PR 描述
generatePRDescription(owner, repo, pullNumber);
