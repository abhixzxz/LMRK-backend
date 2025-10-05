const express = require("express");
const cors = require("cors");
const sql = require("mssql");
require("dotenv").config();

const app = express();
const allowedOrigins = process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : ['http://localhost:5173']; // Default to localhost for dev

app.use(cors({
  origin: function (origin, callback) {
    // allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  credentials: true
}));
app.use(express.json());

// MS SQL config
const config = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER,
  database: process.env.DB_NAME,
  options: {
    encrypt: true, // For Azure SQL or other encrypted connections
    trustServerCertificate: true, // Change to true for local dev / self-signed certs
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
      .input("password", sql.VarChar, password).query`
        SELECT User_ID, User_Name, User_Type, User_Availability_Status 
        FROM Tbl_UserMaster 
        WHERE User_Name = @username 
        AND User_Password = @password 
        AND User_Availability_Status = 1
      `;

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
    
    // Execute the specific stored procedure AuditHVTranRpt_Sp with correct parameter names
    const result = await pool
      .request()
      .input("Br_Name", sql.VarChar(20), branchName || "ALL")
      .input("Section", sql.VarChar(20), section || "DEPOSIT") 
      .input("Scheme", sql.VarChar(30), scheme || "ALL")
      .input("Amount", sql.Decimal(18,2), parseFloat(minAmount || "0"))
      .input("Amount2", sql.Decimal(18,2), parseFloat(maxAmount || "0"))
      .input("Frdate", sql.Date, fromDate)
      .input("Todate", sql.Date, toDate)
      .execute("[dbo].[AuditHVTranRpt_Sp]");

    res.json({ rows: result.recordset });
  } catch (err) {
    console.error("Error fetching high value transactions:", err.message);
    console.error("Full error:", err);
    res.status(500).json({ 
      message: "Failed to fetch high value transaction report from database: " + err.message,
      error: err.message,
      details: err.toString()
    });
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

// ========== Debug Stored Procedure Parameters ==========
app.get("/api/debug/procedure-params", async (req, res) => {
  try {
    const pool = await getDbConnection();
    const result = await pool
      .request()
      .query(`
        SELECT 
          PARAMETER_NAME,
          DATA_TYPE,
          CHARACTER_MAXIMUM_LENGTH,
          PARAMETER_MODE
        FROM INFORMATION_SCHEMA.PARAMETERS
        WHERE SPECIFIC_NAME = 'AuditHVTranRpt_Sp'
        ORDER BY ORDINAL_POSITION
      `);
    
    res.json({ parameters: result.recordset });
  } catch (err) {
    console.error("Error fetching procedure parameters:", err.message);
    res.status(500).json({ message: "Failed to fetch procedure parameters." });
  }
});

// ========== Debug Available Stored Procedures ==========
app.get("/api/debug/procedures", async (req, res) => {
  try {
    const pool = await getDbConnection();
    const result = await pool
      .request()
      .query(`
        SELECT name 
        FROM sys.procedures 
        WHERE name LIKE '%audit%' 
           OR name LIKE '%transaction%' 
           OR name LIKE '%report%'
           OR name LIKE '%HV%'
        ORDER BY name
      `);
    
    res.json({ procedures: result.recordset });
  } catch (err) {
    console.error("Error fetching stored procedures:", err.message);
    res.status(500).json({ message: "Failed to fetch stored procedures." });
  }
});

// ========== Test High Value Transaction Procedure ==========
app.post("/api/debug/test-hvtran", async (req, res) => {
  try {
    const pool = await getDbConnection();
    
    // First, let's test if we can call the procedure with minimal parameters
    console.log("Testing AuditHVTranRpt_Sp execution...");
    
    const result = await pool
      .request()
      .input("Br_Name", sql.VarChar(20), "ALL")
      .input("Section", sql.VarChar(20), "DEPOSIT")
      .input("Scheme", sql.VarChar(30), "ALL")
      .input("Amount", sql.Decimal(18,2), 0)
      .input("Amount2", sql.Decimal(18,2), 999999)
      .input("Frdate", sql.Date, "2024-01-01")
      .input("Todate", sql.Date, "2024-12-31")
      .execute("[dbo].[AuditHVTranRpt_Sp]");

    console.log("Procedure executed successfully");
    console.log("Result recordsets:", result.recordsets ? result.recordsets.length : 0);
    console.log("Result recordset:", result.recordset ? result.recordset.length : 0);
    
    res.json({ 
      success: true,
      recordsets: result.recordsets ? result.recordsets.length : 0,
      recordset: result.recordset ? result.recordset.length : 0,
      data: result.recordset || []
    });
  } catch (err) {
    console.error("Error in test procedure:", err.message);
    console.error("Full error:", err);
    res.status(500).json({ 
      success: false,
      message: err.message,
      details: err.toString()
    });
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
