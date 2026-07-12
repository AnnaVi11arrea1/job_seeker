<div align="center">

# 🔍 Job Seeker — Tech Roles

**A colorful Chrome extension that makes job hunting less horrendous.**

Track roles, save listings you find anywhere on the web, and — with a local AI model —
automatically rank every job against your résumé so you target the ones you're most likely to land.

[![Chrome Extension](https://img.shields.io/badge/Chrome-Manifest_V3-4285F4?logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![JavaScript](https://img.shields.io/badge/JavaScript-Vanilla-F7DF1E?logo=javascript&logoColor=black)](#)
[![Ollama](https://img.shields.io/badge/AI-Ollama%20%C2%B7%20llama3.2-000000?logo=ollama&logoColor=white)](https://ollama.com/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](#-license)
[![Stars](https://img.shields.io/github/stars/annavi11arrea1/job_seeker?style=social)](https://github.com/annavi11arrea1/job_seeker/stargazers)

</div>

---

## ✨ Overview

Job hunting is exhausting — juggling tabs, spreadsheets, and half-remembered listings.
**Job Seeker** turns your browser into a lightweight, interactive job tracker. Add roles as
you browse, right‑click any listing out in the wild to save it, and (optionally) let a
**locally‑hosted AI** read your résumé and rank each job with a 1–5 star match score — so you
spend your energy on the roles where you have the best odds.

> 💡 Everything runs **locally**. The optional AI ranking uses [Ollama](https://ollama.com/)
> on your own machine — your résumé never leaves your computer.

---

## 🎯 Features

- **📝 Add & remove jobs** — build a running list of roles you care about
- **🖱️ Right‑click to save** — found a job on a random company site? Right‑click → *Add to Job Seeker*. Perfect for listings that aren't on the big job boards
- **🤖 AI résumé matching (optional)** — install [Ollama](https://ollama.com/) locally, upload your résumé text, and the extension will:
  - Read your résumé against each job description
  - Assign a **1–5 star** match rating
  - Sort your list so the best‑aligned roles rise to the top
- **🎨 Colorful, interactive UI** — a popup for quick access and a full‑tab view for deep work
- **⚡ Zero cloud dependencies** — no accounts, no servers, no tracking

---

## 🖼️ Screenshots

<div align="center">

**Extension popup**

<img width="380" alt="Job Seeker popup view" src="https://github.com/user-attachments/assets/327c374d-4674-4a24-bb04-7543dd442010" />

**Full tab view**

<img width="620" alt="Job Seeker full tab view" src="https://github.com/user-attachments/assets/fd85177d-6b4e-464d-89a7-8e483b48d17e" />

**Right‑click to add any listing**

<img width="470" alt="Right-click context menu" src="https://github.com/user-attachments/assets/efb1b6fa-7fae-4736-aa24-f73d29cfff01" />

</div>

---

## 🚀 Installation

### 1. (Optional) Set up AI ranking
Install [Ollama](https://ollama.com/) and pull the model:
```bash
ollama pull llama3.2
```
> `llama3.2` works great here. The extension talks to Ollama at `http://localhost:11434`.

### 2. Load the extension
1. Clone or download this repository:
   ```bash
   git clone https://github.com/annavi11arrea1/job_seeker.git
   ```
2. Open Chrome and go to `chrome://extensions`
3. Enable **Developer mode** (top‑right toggle)
4. Click **Load unpacked** and select the `job_seeker` folder
5. Make sure the extension is toggled **on** — you're ready to go! 🎉

---

## 🧭 Usage

| Action | How |
|--------|-----|
| Add a job manually | Open the popup → enter the role → **Add** |
| Save a job from any page | Highlight/visit the listing → **right‑click** → *Add to Job Seeker* |
| Rank jobs by résumé fit | Open **Options** → paste your résumé text → let Ollama score your list |
| Remove a job | Click the remove control on any list item |

---

## 🛠️ Tech Stack

- **Chrome Extension** — Manifest V3 (service worker background, popup, options page)
- **Vanilla JavaScript / HTML / CSS** — no framework, no build step
- **Chrome APIs** — `storage`, `tabs`, `scripting`, `activeTab`, `contextMenus`
- **Ollama** — local LLM inference (`llama3.2`) for résumé‑to‑job matching

---

## ⚠️ Data & Storage

Job Seeker uses the browser's **local storage**. Your list lives on your machine and nothing
is sent to a server. **Heads‑up:** uninstalling the extension will erase your saved jobs, so
export or note anything important before removing it.

---

## 🤝 Contributing

Contributions are welcome! Please branch using the format `dev_adding_feature`:

```bash
git checkout -b dev_adding_feature
```

Then open a pull request describing your change.

---

## ☕ Support

If Job Seeker made your search a little less painful:

- ⭐ **Star this repo** — it genuinely helps!
- ☕ [**Buy me a coffee**](https://www.paypal.com/ncp/payment/NZELSQ7ST82WU) — thank you! 🙏

---

## 📄 License

Released under the [MIT License](LICENSE).

<div align="center">

Made with 💛 by [Anna Villarreal](https://github.com/annavi11arrea1)

</div>
