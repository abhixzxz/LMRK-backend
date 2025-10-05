# Permission Fix for Node.js Binaries

## Problem
Sometimes after npm install, the binaries in `node_modules/.bin/` don't have execute permissions, causing errors like:
```
sh: /path/to/node_modules/.bin/nodemon: Permission denied
```

## Permanent Solutions Implemented

### 1. Automatic Fix (Recommended)
The `package.json` now includes a `postinstall` script that automatically fixes permissions after every `npm install`:

```json
"scripts": {
  "postinstall": "chmod +x node_modules/.bin/* 2>/dev/null || true"
}
```

### 2. Manual Fix Script
Run the provided script anytime you encounter permission issues:
```bash
npm run fix-permissions
```

### 3. Direct Command
If needed, you can also run the fix directly:
```bash
chmod +x node_modules/.bin/*
```

## Why This Happens
This issue commonly occurs on macOS and Linux systems when:
- Node modules are extracted without proper permissions
- The file system doesn't preserve executable permissions
- Using certain package managers or installation methods

## Prevention
The `postinstall` script ensures this issue never happens again automatically after any `npm install` or `npm ci` command.
