# Auto Generate PR Description Action

This GitHub Action is designed to automatically generate descriptions for Pull Requests by integrating OpenAI and GitHub APIs to analyze changes in a PR and produce a corresponding description.

## Features

- Extract commit messages and file changes from PRs.
- Utilize OpenAI's GPT-4 model to automatically generate descriptive text.
- Update the PR's description field with the generated content.

## Usage

To use this action, you need to create a YAML file in the `.github/workflows` directory of your project. Here is an example configuration:

```yaml
name: 'Auto Generate PR Description'

on:
  pull_request:
    types: [opened, synchronize]

jobs:
  generate-pr-description:
    runs-on: ubuntu-latest

    steps:
      # Checkout the repository
      - name: Checkout the repository
        uses: actions/checkout@v3

      # Use the action to generate the PR description
      - name: Auto Generate PR Description Action
        uses: class90431/pr-description-generator@main
        with:
          repository_owner: ${{ github.repository_owner }}
          repository_name: ${{ github.event.pull_request.base.repo.name }}
          pull_request_number: ${{ github.event.pull_request.number }}
          branch_name: ${{ github.event.pull_request.head.ref }}
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          GITHUB_TOKEN: ${{ secrets.SOFTWARE_GITHUB_TOKEN }}
```

## Configuration

You will need to add the following Secrets to your GitHub project settings to use this Action:

- `OPENAI_API_KEY`: Your API key from OpenAI used for invoking the GPT model.
- `SOFTWARE_GITHUB_TOKEN`: A token with access to your GitHub repository.

## Contributions

Contributions from the community are welcome. If you have improvement ideas or find bugs, please feel free to open an Issue or submit a Pull Request.

## License

[MIT License](LICENSE)
