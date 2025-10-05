const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

console.log("Starting server...");

// Health Check API
app.get("/api/health", (req, res) => {
  console.log("Health check requested");
  const status = {
    server: "running",
    database: "disconnected",
    timestamp: new Date().toISOString()
  };
  res.json(status);
});

// Branches API with mock data
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

// High Value Transaction Report API with mock data
app.post("/api/reports/high-value", (req, res) => {
  console.log("High value report requested with:", req.body);
  const { branchName, fromDate, toDate } = req.body;
  
  const mockRows = [
    {
      Account_No: "ACC001",
      Customer_Name: "John Doe",
      Branch_Name: branchName || "ALL",
      Transaction_Amount: 550000,
      Transaction_Date: fromDate,
      Transaction_Type: "DEPOSIT"
    },
    {
      Account_No: "ACC002", 
      Customer_Name: "Jane Smith",
      Branch_Name: branchName || "ALL",
      Transaction_Amount: 575000,
      Transaction_Date: toDate,
      Transaction_Type: "WITHDRAWAL"
    }
  ];
  
  res.json({ 
    rows: mockRows,
    warning: "Using mock data - database not available"
  });
});

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`✓ Server running on http://localhost:${PORT}`);
  console.log("⚠ Running with mock data - database connection disabled");
});
