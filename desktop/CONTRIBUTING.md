# Contributing to Grida Desktop on macOS

Thank you for your interest in contributing to Grida Desktop! We appreciate your contributions and welcome improvements, bug fixes, and new ideas. This guide is tailored specifically for macOS users.

## Table of Contents
- [Prerequisites](#prerequisites)
- [Setting Up Your Environment](#setting-up-your-environment)
- [Development Workflow](#development-workflow)

## Prerequisites

Before you start, ensure you have the following installed on your Mac:

- **Homebrew**  
  [Installation instructions](https://brew.sh/)

- **Node.js**  
  We recommend using Node.js 18 or later. Install via Homebrew or [nvm](https://github.com/nvm-sh/nvm).

- **pnpm**
  This project uses pnpm for package management.

- **Mono and Wine** (only if you plan to build Windows binaries)  
  Install these via Homebrew:
  ```sh
  brew install mono
  brew install --cask wine-stable


## Setting Up Your Environment


1.	Clone the Repository

```bash
git clone https://github.com/gridaco/grida.git
cd grida/desktop
```

2.	Install Dependencies

```bash
pnpm install
```

3.	Configure Environment Variables

Create a .env file in the project root (if required) using the provided .env.example as a guide.


## Development Workflow

```bash
pnpm run dev
```


## Troubleshooting Mono and Wine Installation

If you still see:
```
Error: You must install both Mono and Wine on non-Windows
```

after installing both, try the following steps:

1. **Verify Installation**
   ```sh
   mono --version
   wine --version
   ```

You might see `“Wine Stable.app” Not Opened`. Go to System Preferences > Security & Privacy and allow the app to open.

Check if you have Rosetta installed. If not, you can install it by running:
```sh
softwareupdate --install-rosetta
```


## Linux Build on macOS using Docker

If you're on macOS and want to build Linux packages for Grida Desktop, you can use Docker to simulate a Linux environment.

### Prerequisites

- **Docker Desktop for Mac:**  
  Install Docker from [Docker's website](https://www.docker.com/products/docker-desktop).

- **Project Dependencies:**  
  Ensure your project uses Node.js and pnpm (or npm) as specified in the repository.

### Steps to Build Linux Packages

1. **Pull a Linux Docker Image:**  
   Use an image that matches your build environment, for example, Node 18 on Debian Bullseye.
   ```sh
   docker pull node:22-bullseye