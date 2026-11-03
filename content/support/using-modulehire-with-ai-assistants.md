# Using ModuleHire with Claude, ChatGPT and Cursor

You can connect your ModuleHire account to an AI assistant. Once it is connected, you can save new wins to your library, tailor a resume to a job, edit it line by line, and track applications from the chat.

The full guide, with example prompts and the list of tools, is at [modulehire.com/mcp](/mcp).

## What you need

- A ModuleHire account with at least one resume uploaded
- An AI app that supports remote MCP connectors, such as Claude, ChatGPT (developer mode), Cursor or Claude Code

## How to connect

1. In your AI app, add a custom connector (it may be called an app, an integration or an MCP server).
2. Use this server URL: `https://www.modulehire.com/api/mcp`
3. When the app asks you to sign in, you'll go to modulehire.com. Sign in if needed and choose **Allow**.
4. Turn ModuleHire on in a chat and ask something like "What's in my ModuleHire library?"

Step-by-step instructions for each app are on the [setup section of the guide](/mcp#setup).

## What the app can do

- **Read** your skill modules, work history, analyzed jobs, resumes, fit scores and job tracker
- **Change** things you ask for: add a module, rewrite or reorder resume lines, hide sections, track an application, or create a PDF or Word download
- **Use ModuleHire's AI** for two things only: generating a new tailored resume (this counts toward your monthly limit) and interview prep (Pro)

The AI app never sees your password. It only reads your data when it calls a ModuleHire tool to answer something you asked.

## Fact checking

Your modules are the only source of facts. If an edit adds a number or a name that the line's source module does not contain, ModuleHire saves the edit, flags it, and tells the AI to check it with you.

## Limits

Connected apps use your normal plan. Reading, editing, exporting and tracking are free on every plan. To keep a runaway assistant from hammering your account, each account can make up to 60 requests a minute and 600 an hour, with lower hourly caps on exports, editor links and interview prep. If you hit one, the assistant will tell you; wait a little and try again.

## Disconnecting

Go to **Account**, then **Connected accounts**, and choose **Disconnect** next to the app under **AI apps**. Access ends right away. You can also remove ModuleHire in the AI app's own connector settings.

## Troubleshooting

- **The app says it can't connect.** Check the URL starts with `https://www.` and ends with `/api/mcp`.
- **The sign-in page loops or shows an error.** Sign in at modulehire.com first in the same browser, then connect again.
- **The app stopped working after a while.** Disconnect it under Account and connect again.

---

*Questions? Contact us at info@modulehire.com*
