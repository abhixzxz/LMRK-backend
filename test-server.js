const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

console.log("Starting server...");

app.get("/api/health", (req, res) => {
  console.log("Health check requested");
  res.json({
    server: "running",
    database: "testing",
    timestamp: new Date().toISOString()
  });
});

app.get("/api/branches", (req, res) => {
  console.log("Branches requested");
  const mockBranches = [
    "HEAD OFFICE",
    "MAIN BRANCH", 
    "BRANCH 1",
    "BRANCH 2",
    "BRANCH 3"
  ];
  
  res.json({ 
    branches: mockBranches,
    warning: "Using mock data - database not available"
  });
});

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`✓ Server running on http://localhost:${PORT}`);
});
