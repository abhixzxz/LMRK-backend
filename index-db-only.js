const express = require("express");
const cors = require("cors");
const sql = require("mssql");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

const config = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER,
  database: process.env.DB_NAME,
  options: {
    encrypt: true,
    trustServerCertificate: true,
  },
  connectionTimeout: 5000, // 5 second timeout
  requestTimeout: 10000,   // 10 second timeout
};

// Global connection pool
let globalPool = null;

// Initialize database connection
async function initializeDatabase() {
  try {
    if (globalPool) {
      return globalPool;
    }
    
    console.log("Connecting to database...");
    globalPool = await sql.connect(config);
    console.log("Database connected successfully");
    return globalPool;
  } catch (err) {
    console.error("Database connection failed:", err.message);
    globalPool = null;
    throw err;
  }
}

// Get database connection
async function getDbConnection() {
  if (!globalPool) {
    try {
      return await initializeDatabase();
    } catch (err) {
      throw new Error("Database connection not available");
    }
  }
  return globalPool;
}

// ========== Health Check API ==========
app.get("/api/health", (req, res) => {
  const status = {
    server: "running",
    database: globalPool ? "connected" : "disconnected",
    timestamp: new Date().toISOString()
  };
  res.json(status);
});

// ========== Existing Login API ==========
app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res
      .status(400)
      .json({ message: "Username and password are required" });
  }

  try {
    const pool = await getDbConnection();
    const result = await pool
      .request()
      .input("username", sql.VarChar, username)
      .input("password", sql.VarChar, password)
      .query(
        `SELECT User_Name, User_Password
         FROM Tbl_UserMaster
         WHERE User_Name = @username
         AND User_Password = @password`
      );
    console.log("Login attempt for:", username);
    
    if (result.recordset.length > 0) {
      res.json(result.recordset[0]);
    } else {
      res
        .status(401)
        .json({ message: "Invalid username, password, or account inactive" });
    }
  } catch (err) {
    console.error("Database error during login:", err.message);
    res.status(500).json({ message: "Database connection error during login." });
  }
});

// ========== Existing Issue Submission API ==========
app.post("/api/issues", async (req, res) => {
  const {
    Cmp_Code,
    Issue_Module,
    Issue_Description,
    Issue_Remarks,
    Reported_By,
    Reported_Date,
    Priority,
    Due_Date,
  } = req.body;

  try {
    const pool = await getDbConnection();
    await pool
      .request()
      .input("Cmp_Code", sql.VarChar, Cmp_Code)
      .input("Issue_Module", sql.VarChar, Issue_Module)
      .input("Issue_Description", sql.VarChar, Issue_Description)
      .input("Issue_Remarks", sql.VarChar, Issue_Remarks)
      .input("Reported_By", sql.VarChar, Reported_By)
      .input("Reported_Date", sql.DateTime, Reported_Date)
      .input("Priority", sql.VarChar, Priority)
      .input("Due_Date", sql.DateTime, Due_Date)
      .query(
        `INSERT INTO dbo.Tbl_IssueMaster
          (Cmp_Code, Issue_Module, Issue_Description, Issue_Remarks, Reported_By, Reported_Date, Priority, Due_Date)
         VALUES
          (@Cmp_Code, @Issue_Module, @Issue_Description, @Issue_Remarks, @Reported_By, @Reported_Date, @Priority, @Due_Date)`
      );
    res.status(200).json({ message: "Issue inserted successfully" });
  } catch (err) {
    console.error("Database error during issue insertion:", err.message);
    res.status(500).json({ error: "Database connection error during issue insertion." });
  }
});

// ========== Complaint Report API ==========
app.post("/api/complaint-report", async (req, res) => {
  try {
    const pool = await getDbConnection();
    const result = await pool.request().execute("ComplaintRegister_Sp");
    const rows = result.recordset;
    res.json(rows);
  } catch (err) {
    console.error("Error executing ComplaintRegister_Sp:", err.message);
    res.status(500).json({ message: "Failed to fetch complaint report from database." });
  }
});

// ========== Branches API ==========
app.get("/api/branches", async (req, res) => {
  try {
    const pool = await getDbConnection();
    const result = await pool
      .request()
      .query("SELECT Br_Name FROM Gen_BranchDetails_P_Tbl");
    
    // Extract branch names from the result
    const branches = result.recordset.map(record => record.Br_Name);
    
    res.json({ branches });
  } catch (err) {
    console.error("Error fetching branches:", err.message);
    res.status(500).json({ message: "Failed to fetch branch list from database." });
  }
});

// ========== High Value Transaction Report API ==========
app.post("/api/reports/high-value", async (req, res) => {
  try {
    const {
      branchName,
      section,
      scheme,
      minAmount,
      maxAmount,
      fromDate,
      toDate,
    } = req.body;

    const pool = await getDbConnection();
    
    // Replace with your actual stored procedure or query
    const result = await pool
      .request()
      .input("BranchName", sql.VarChar, branchName || "ALL")
      .input("Section", sql.VarChar, section || "DEPOSIT")
      .input("Scheme", sql.VarChar, scheme || "ALL")
      .input("MinAmount", sql.Money, parseFloat(minAmount || "0"))
      .input("MaxAmount", sql.Money, parseFloat(maxAmount || "0"))
      .input("FromDate", sql.Date, fromDate)
      .input("ToDate", sql.Date, toDate)
      .execute("HighValueTransactionReport_SP"); // Replace with your actual stored procedure

    res.json({ rows: result.recordset });
  } catch (err) {
    console.error("Error fetching high value transactions:", err.message);
    res.status(500).json({ message: "Failed to fetch high value transaction report from database." });
  }
});

// ========== Start Server ==========
async function startServer() {
  const PORT = process.env.PORT || 4000;
  
  console.log(`Starting server on port ${PORT}...`);
  
  // Initialize database connection first - REQUIRED
  try {
    console.log("Attempting database connection...");
    await initializeDatabase();
    console.log("✓ Database connected successfully");
    
    // Only start server after successful database connection
    app.listen(PORT, () => {
      console.log(`✓ Server running on http://localhost:${PORT}`);
      console.log("✓ Database connection established - ready for requests");
    });
  } catch (err) {
    console.error("❌ Database connection failed:", err.message);
    console.error("❌ Server NOT starting - database connection required");
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...');
  if (globalPool) {
    await globalPool.close();
    console.log('Database connection closed');
  }
  process.exit(0);
});

startServer();
