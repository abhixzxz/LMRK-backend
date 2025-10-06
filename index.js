const express = require("express");
const cors = require("cors");
const sql = require("mssql");
const cookieParser = require("cookie-parser");
require("dotenv").config();

// Validate required environment variables
const requiredEnvVars = ["DB_USER", "DB_PASSWORD", "DB_SERVER", "DB_NAME"];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`❌ Missing required environment variable: ${envVar}`);
    process.exit(1);
  }
}

const app = express();
app.use(cors({ origin: "*" }));

app.get("/", (req, res) => {
  res.send("CORS is wide open!  v1🌍");
});

// Security middleware
app.use((req, res, next) => {
  // Security headers
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains"
  );
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");

  // Remove server information
  res.removeHeader("X-Powered-By");

  next();
});

// CORS configuration with JWT support
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://localhost:5174",
      "http://localhost:5175",
      "http://localhost:5176",
      "http://localhost:5177",
      "http://localhost:3000",
    ], // Only allow specific origins
    credentials: true, // Allow cookies and authorization headers
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
      "Accept",
      "Origin",
    ],
    exposedHeaders: ["Authorization"], // Allow frontend to access Authorization header
    optionsSuccessStatus: 200, // For legacy browser support
  })
);

// Cookie parser middleware for handling JWT in cookies
app.use(cookieParser());

// JSON parsing middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Rate limiting would be good here (consider using express-rate-limit)

// Input validation helper
const validateInput = (input, type = "string", maxLength = 255) => {
  if (!input) return null;

  switch (type) {
    case "string":
      return typeof input === "string" && input.length <= maxLength
        ? input.trim()
        : null;
    case "number":
      return !isNaN(parseFloat(input)) ? parseFloat(input) : null;
    case "date":
      const date = new Date(input);
      return !isNaN(date.getTime()) ? date : null;
    default:
      return null;
  }
};

// ========== Health Check API ==========

// ========== Secure Login API ==========
app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;

  console.log("Login attempt received:", {
    username,
    passwordLength: password?.length,
  });

  // Input validation
  const validUsername = validateInput(username, "string", 50);
  const validPassword = validateInput(password, "string", 100);

  if (!validUsername || !validPassword) {
    console.log("Validation failed:", {
      validUsername: !!validUsername,
      validPassword: !!validPassword,
    });
    return res
      .status(400)
      .json({ message: "Valid username and password are required" });
  }

  try {
    const pool = await getDbConnection();
    console.log("Database connection obtained");

    const result = await pool
      .request()
      .input("username", sql.VarChar(50), validUsername)
      .input("password", sql.VarChar(100), validPassword)
      .query(
        `SELECT User_Name, User_Password, User_ID
         FROM Tbl_UserMaster
         WHERE User_Name = @username
         AND User_Password = @password`
      );

    console.log("Query executed. Records found:", result.recordset.length);
    console.log("Login attempt for:", validUsername);

    if (result.recordset.length > 0) {
      // Don't return password in response
      const { User_Password, ...userWithoutPassword } = result.recordset[0];
      console.log("Login successful for:", validUsername);
      res.json(userWithoutPassword);
    } else {
      // Let's also check if user exists but with wrong password
      const userCheckResult = await pool
        .request()
        .input("username", sql.VarChar(50), validUsername)
        .query(
          `SELECT User_Name, User_Password
           FROM Tbl_UserMaster
           WHERE User_Name = @username`
        );

      console.log("User check result:", {
        found: userCheckResult.recordset.length > 0,
        data:
          userCheckResult.recordset.length > 0
            ? {
                username: userCheckResult.recordset[0].User_Name,
                passwordMatch:
                  userCheckResult.recordset[0].User_Password === validPassword,
              }
            : null,
      });

      res.status(401).json({ message: "Invalid username or password" });
    }
  } catch (err) {
    console.error("Database error during login:", err);
    res.status(500).json({
      message: "Authentication error. Please try again later.",
      error: err.message,
    });
  }
});

// ========== Existing Issue Submission API ==========

// API Endpoint 2: Get report data by executing the stored procedure

// ========== Complaint Report API ==========

// ========== High Value Transaction Report API ==========

// Note: Debug endpoints removed for security
// These endpoints should only be available in development mode
app.get("/api/reports/menu", async (req, res) => {
  try {
    const pool = await getDbConnection();
    const result = await pool.request().query(`
        SELECT 
          Mnu_ID,
          Mnu_Caption,
          Mnu_URL,
          Mnu_Description,
          Mnu_Order,
          Mnu_Active
        FROM [Menu_Report_tbl]
        WHERE Mnu_Active = 1
        ORDER BY Mnu_Order ASC, Mnu_Caption ASC
      `);

    // Transform the data to a more frontend-friendly format
    const menuItems = result.recordset.map((record) => ({
      id: record.Mnu_ID,
      caption: record.Mnu_Caption,
      url: record.Mnu_URL,
      description: record.Mnu_Description,
      order: record.Mnu_Order,
      active: record.Mnu_Active,
    }));

    console.log(
      `✓ Successfully fetched ${menuItems.length} menu items from database`
    );
    res.json({ menuItems });
  } catch (err) {
    console.error("Error fetching report menu items:", err.message);
    res
      .status(500)
      .json({ message: "Failed to fetch report menu items from database." });
  }
});

// ========== =========================================

if (process.env.NODE_ENV !== "production") {
  app.get("/api/debug/menu-table", async (req, res) => {
    try {
      const pool = await getDbConnection();

      // Get table schema information
      const schema = await pool.request().query(`
        SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'Menu_Report_tbl'
        ORDER BY ORDINAL_POSITION
      `);

      // Get sample data
      const sample = await pool.request().query(`
        SELECT TOP 3 * FROM [Menu_Report_tbl] ORDER BY Mnu_Order ASC
      `);

      res.json({
        table_schema: schema.recordset,
        sample_data: sample.recordset,
        row_count: sample.recordset.length,
      });
    } catch (err) {
      console.error("Error checking table structure:", err.message);
      res.status(500).json({ error: err.message });
    }
  });
}

const config = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER,
  database: process.env.DB_NAME,
  options: {
    encrypt: true,
    trustServerCertificate: true,
    enableArithAbort: true,
  },
  connectionTimeout: 30000, // 30 second timeout
  requestTimeout: 30000, // 30 second timeout
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
  parseJSON: true,
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

    // Add error handlers for the pool
    globalPool.on("error", (err) => {
      console.error("Database pool error:", err);
      globalPool = null; // Reset pool on error
    });

    console.log("Database connected successfully");

    // Test the connection
    await globalPool.request().query("SELECT 1 as test");
    console.log("Database connection test successful");

    return globalPool;
  } catch (err) {
    console.error("Database connection failed:", err.message);
    globalPool = null;
    throw err;
  }
}

// ==================================================================================
async function getDbConnection() {
  if (!globalPool) {
    try {
      return await initializeDatabase();
    } catch (err) {
      throw new Error("Database connection not available");
    }
  }

  // Check if pool is still connected
  try {
    await globalPool.request().query("SELECT 1 as test");
    return globalPool;
  } catch (err) {
    console.log("Database connection lost, attempting to reconnect...");
    globalPool = null;
    return await initializeDatabase();
  }
}

// Import authentication utilities
const {
  generateAccessToken,
  generateRefreshToken,
  hashPassword,
  comparePassword,
  authenticateToken,
  optionalAuthForReports,
  refreshAccessToken,
} = require("./utils/auth");

// ========== AUTHENTICATION ROUTES ==========

// Login endpoint with JWT
app.post("/api/auth/login", async (req, res) => {
  const { username, password } = req.body;

  // Input validation
  if (!username || !password) {
    return res.status(400).json({
      success: false,
      message: "Username and password are required",
    });
  }

  try {
    const pool = await getDbConnection();

    // Check if user exists
    const userResult = await pool
      .request()
      .input("username", sql.VarChar(50), username.trim()).query(`
        SELECT User_Name, User_Password, User_ID, Role
        FROM Tbl_UserMaster 
        WHERE User_Name = @username
      `);

    if (userResult.recordset.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Invalid username or password",
      });
    }

    const user = userResult.recordset[0];

    // For now, we'll do plain text comparison (you should hash passwords in production)
    // In production, use: const isValidPassword = await comparePassword(password, user.User_Password);
    const isValidPassword = password === user.User_Password;

    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        message: "Invalid username or password",
      });
    }

    // Generate tokens
    const tokenPayload = {
      userId: user.User_ID,
      username: user.User_Name,
      role: user.Role || "user",
    };

    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);

    // Set HTTP-only cookie for refresh token (more secure)
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    res.json({
      success: true,
      message: "Login successful",
      data: {
        accessToken,
        user: {
          userId: user.User_ID,
          username: user.User_Name,
          role: user.Role || "user",
        },
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// Logout endpoint
app.post("/api/auth/logout", (req, res) => {
  // Clear the refresh token cookie
  res.clearCookie("refreshToken");

  res.json({
    success: true,
    message: "Logged out successfully",
  });
});

// Refresh token endpoint
app.post("/api/auth/refresh", (req, res) => {
  const refreshToken = req.cookies.refreshToken || req.body.refreshToken;

  if (!refreshToken) {
    return res.status(401).json({
      success: false,
      message: "Refresh token required",
    });
  }

  // Use the refresh middleware
  req.body.refreshToken = refreshToken;
  refreshAccessToken(req, res);
});

// Get current user info (protected route)
app.get("/api/auth/me", authenticateToken, async (req, res) => {
  try {
    const pool = await getDbConnection();

    const userResult = await pool
      .request()
      .input("userId", sql.Int, req.user.userId).query(`
        SELECT User_ID, User_Name, Role, Active
        FROM Tbl_UserMaster 
        WHERE User_ID = @userId AND Active = 1
      `);

    if (userResult.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const user = userResult.recordset[0];

    res.json({
      success: true,
      data: {
        user: {
          userId: user.User_ID,
          username: user.User_Name,
          role: user.Role || "user",
        },
      },
    });
  } catch (error) {
    console.error("Get user error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// ========== END AUTHENTICATION ROUTES ==========

// ========== TESTING ROUTE - Get available usernames ==========
app.get("/api/test/users", async (req, res) => {
  try {
    const pool = await getDbConnection();

    const userResult = await pool.request().query(`
        SELECT User_Name, User_ID
        FROM Tbl_UserMaster 
        WHERE Active = 1
        ORDER BY User_Name
      `);

    const users = userResult.recordset.map((user) => ({
      username: user.User_Name,
      userId: user.User_ID,
    }));

    res.json({
      success: true,
      message: "Available users for testing",
      data: users,
    });
  } catch (error) {
    console.error("Get test users error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching users",
    });
  }
});

// Debug endpoint to check specific user
app.get("/api/test/user/:username", async (req, res) => {
  try {
    const pool = await getDbConnection();
    const username = req.params.username;

    const userResult = await pool
      .request()
      .input("username", sql.VarChar(50), username).query(`
        SELECT User_Name, User_Password, User_ID, Active, Role
        FROM Tbl_UserMaster 
        WHERE User_Name = @username
      `);

    if (userResult.recordset.length === 0) {
      return res.json({
        success: false,
        message: "User not found",
        username: username,
      });
    }

    const user = userResult.recordset[0];
    res.json({
      success: true,
      message: "User found",
      data: {
        username: user.User_Name,
        userId: user.User_ID,
        active: user.Active,
        role: user.Role,
        passwordLength: user.User_Password?.length || 0,
        passwordMatch: user.User_Password === "2255",
      },
    });
  } catch (error) {
    console.error("Get user error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching user",
      error: error.message,
    });
  }
});

app.get("/api/Users", authenticateToken, async (req, res) => {
  try {
    const pool = await getDbConnection();
    const result = await pool
      .request()
      .query("SELECT User_Name FROM User_Details_M_Tbl ");

    // Extract user names from the result
    const users = result.recordset.map((record) => record.User_Name);
    res.json({ users });
  } catch (err) {
    console.error("Error fetching users:", err.message);
    res
      .status(500)
      .json({ message: "Failed to fetch users list from database." });
  }
});

//===============================================userrightReport=======================

// ========== USER CREATION API ==========
app.post("/api/usercreatapi", async (req, res) => {
  const {
    userName,
    userPassword,
    userType,
    userAvailabilityStatus,
    mobile,
    email,
  } = req.body;

  console.log("User creation attempt received:", {
    userName,
    userType,
    userAvailabilityStatus,
    mobile,
    email,
    passwordLength: userPassword?.length,
  });

  // Input validation
  const validUserName = validateInput(userName, "string", 50);
  const validUserPassword = validateInput(userPassword, "string", 100);
  const validUserType = validateInput(userType, "string", 20);
  const validUserAvailabilityStatus = validateInput(
    userAvailabilityStatus,
    "string",
    10
  );
  const validMobile = validateInput(mobile, "string", 15);
  const validEmail = validateInput(email, "string", 100);

  if (
    !validUserName ||
    !validUserPassword ||
    !validUserType ||
    !validUserAvailabilityStatus ||
    !validMobile ||
    !validEmail
  ) {
    console.log("Validation failed for user creation");
    return res.status(400).json({
      success: false,
      message: "All fields are required and must be valid",
    });
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(validEmail)) {
    return res.status(400).json({
      success: false,
      message: "Please enter a valid email address",
    });
  }

  // Validate user type
  if (!["Admin", "User"].includes(validUserType)) {
    return res.status(400).json({
      success: false,
      message: "User Type must be either 'Admin' or 'User'",
    });
  }

  // Validate availability status
  if (!["YES", "NO"].includes(validUserAvailabilityStatus)) {
    return res.status(400).json({
      success: false,
      message: "User Availability Status must be either 'YES' or 'NO'",
    });
  }

  try {
    const pool = await getDbConnection();
    console.log("Database connection obtained for user creation");

    // Check if user already exists
    const existingUserResult = await pool
      .request()
      .input("userName", sql.VarChar(50), validUserName).query(`
        SELECT User_Name 
        FROM Tbl_UserMaster 
        WHERE User_Name = @userName
      `);

    if (existingUserResult.recordset.length > 0) {
      console.log("User already exists:", validUserName);
      return res.status(409).json({
        success: false,
        message: "User with this name already exists",
      });
    }

    // Insert new user
    const insertResult = await pool
      .request()
      .input("userName", sql.VarChar(50), validUserName)
      .input("userPassword", sql.VarChar(100), validUserPassword)
      .input("userType", sql.VarChar(20), validUserType)
      .input(
        "userAvailabilityStatus",
        sql.VarChar(10),
        validUserAvailabilityStatus
      )
      .input("mobile", sql.VarChar(15), validMobile)
      .input("email", sql.VarChar(100), validEmail).query(`
        INSERT INTO [dbo].[Tbl_UserMaster]
        ([User_Name], [User_Password], [User_Type], [User_Availability_Status], [User_Mobile], [User_Email])
        VALUES (@userName, @userPassword, @userType, @userAvailabilityStatus, @mobile, @email)
      `);

    console.log("User created successfully:", validUserName);

    res.json({
      success: true,
      message: "User created successfully",
      data: {
        userName: validUserName,
        userType: validUserType,
        userAvailabilityStatus: validUserAvailabilityStatus,
      },
    });
  } catch (err) {
    console.error("Database error during user creation:", err);

    // Handle specific SQL errors
    if (err.number === 2627) {
      // Unique constraint violation
      return res.status(409).json({
        success: false,
        message: "User with this name already exists",
      });
    }

    res.status(500).json({
      success: false,
      message: "Failed to create user. Please try again later.",
      error: err.message,
    });
  }
});

app.post("/api/userright", authenticateToken, async (req, res) => {
  try {
    const user = req.body.user || req.body.Users;

    const validUser = validateInput(user, "string", 100);
    if (!validUser) {
      return res.status(400).json({ message: "A valid user is required." });
    }

    const pool = await getDbConnection();
    const request = pool.request();
    request.input("Userid", sql.VarChar, validUser);
    const result = await request.execute("AuditUserrightRpt_Sp");
    res.json({ rows: result.recordset || [] });
  } catch (err) {
    console.error("Error in /api/report:", err.message);
    res
      .status(500)
      .json({ message: "Failed to fetch report data.", error: err.message });
  }
});

// ============================================================================

app.post("/api/userright-transfer", authenticateToken, async (req, res) => {
  try {
    const { user, fromDate, toDate } = req.body;

    // Input validation
    const validUser = validateInput(user, "string", 10);
    const validFromDate = validateInput(fromDate, "string", 20);
    const validToDate = validateInput(toDate, "string", 20);

    if (!validUser) {
      return res.status(400).json({ message: "A valid user is required." });
    }
    if (!validFromDate || !validToDate) {
      return res
        .status(400)
        .json({ message: "Valid FromDate and ToDate are required." });
    }

    const pool = await getDbConnection();
    const request = pool.request();
    request.input("userName", sql.VarChar(10), validUser);
    request.input("Frdate", sql.VarChar(20), validFromDate);
    request.input("ToDate", sql.VarChar(20), validToDate);

    const result = await request.execute("AuditUserrightTranRpt_sp");
    res.json({ rows: result.recordset || [] });
  } catch (err) {
    console.error("Error in /api/userright-transfer:", err.message);
    res.status(500).json({
      message: "Failed to fetch user right transfer report data.",
      error: err.message,
    });
  }
});

// ========== Cancelled Scrolls Report APIs ==========

// Get sections for cancelled scrolls report
app.get("/api/sections", async (req, res) => {
  try {
    const pool = await getDbConnection();
    const result = await pool
      .request()
      .query("SELECT DISTINCT Sch_Section_Name FROM Gen_SchemeMaster_P_Tbl ");

    const sections = result.recordset.map((record) => record.Sch_Section_Name);
    res.json({ sections });
  } catch (err) {
    console.error("Error fetching sections:", err.message);
    res.status(500).json({
      message: "Failed to fetch sections from database.",
      error: err.message,
    });
  }
});

// Get schemes based on section for cancelled scrolls report
app.post("/api/schemes", async (req, res) => {
  const { section } = req.body;

  const validSection = validateInput(section, "string", 50);
  if (!validSection) {
    return res.status(400).json({ message: "Valid section is required" });
  }

  try {
    const pool = await getDbConnection();
    const result = await pool
      .request()
      .input("section", sql.VarChar(50), validSection)
      .query(
        "SELECT Sch_Name FROM Gen_SchemeMaster_P_Tbl WHERE Sch_Section_Name = @section"
      );

    const schemes = result.recordset.map((record) => record.Sch_Name);
    res.json({ schemes });
  } catch (err) {
    console.error("Error fetching schemes:", err.message);
    res.status(500).json({
      message: "Failed to fetch schemes from database.",
      error: err.message,
    });
  }
});

// ========== HIGH VALUE TRANSACTIONS REPORT API ==================
app.post("/api/high-value-trans", optionalAuthForReports, async (req, res) => {
  console.log("🔍 High value transactions API called");
  console.log("Request body:", req.body);

  try {
    const { branchName, section, scheme, amount1, amount2, fromDate, toDate } =
      req.body;

    // Validation
    if (!branchName) {
      return res.status(400).json({ message: "Branch name is required" });
    }
    if (!section) {
      return res.status(400).json({ message: "Section is required" });
    }
    if (!scheme) {
      return res.status(400).json({ message: "Scheme is required" });
    }
    if (!amount1) {
      return res.status(400).json({ message: "Minimum amount is required" });
    }
    if (!amount2) {
      return res.status(400).json({ message: "Maximum amount is required" });
    }
    if (!fromDate) {
      return res.status(400).json({ message: "From date is required" });
    }
    if (!toDate) {
      return res.status(400).json({ message: "To date is required" });
    }

    // Validate string lengths as per stored procedure requirements
    if (branchName.length > 10) {
      return res
        .status(400)
        .json({ message: "Branch name too long (max 10 characters)" });
    }
    if (section.length > 10) {
      return res
        .status(400)
        .json({ message: "Section too long (max 10 characters)" });
    }
    if (scheme.length > 30) {
      return res
        .status(400)
        .json({ message: "Scheme too long (max 30 characters)" });
    }

    // Validate amounts are valid numbers
    const minAmountNum = parseFloat(amount1);
    const maxAmountNum = parseFloat(amount2);
    if (isNaN(minAmountNum) || minAmountNum < 0) {
      return res
        .status(400)
        .json({ message: "Minimum amount must be a valid positive number" });
    }
    if (isNaN(maxAmountNum) || maxAmountNum < 0) {
      return res
        .status(400)
        .json({ message: "Maximum amount must be a valid positive number" });
    }
    if (minAmountNum > maxAmountNum) {
      return res.status(400).json({
        message: "Minimum amount cannot be greater than maximum amount",
      });
    }

    console.log(`Calling stored procedure: AuditHVTranRpt_Sp`);
    console.log(
      `Parameters: Br_Name='${branchName}', Section='${section}', Scheme='${scheme}', Amount='${amount1}', Amount2='${amount2}', Frdate='${fromDate}', Todate='${toDate}'`
    );

    const pool = await getDbConnection();
    const request = pool.request();
    request.input("Br_Name", sql.VarChar(10), branchName);
    request.input("Section", sql.VarChar(10), section);
    request.input("Scheme", sql.VarChar(30), scheme);
    request.input("Amount", sql.Decimal(18, 2), parseFloat(amount1));
    request.input("Amount2", sql.Decimal(18, 2), parseFloat(amount2));
    request.input("Frdate", sql.VarChar(20), fromDate);
    request.input("Todate", sql.VarChar(20), toDate);

    console.log("About to execute stored procedure...");
    const result = await request.execute("AuditHVTranRpt_Sp");
    console.log("Stored procedure executed successfully");

    console.log(
      "✓ High value transactions report executed successfully. Records:",
      result.recordset?.length || 0
    );

    if (result.recordset && result.recordset.length > 0) {
      console.log("Sample data (first row):", result.recordset[0]);
    }

    res.json({ rows: result.recordset || [] });
  } catch (err) {
    console.error("Error in /api/high-value-trans:", err.message);
    console.error("Full error details:", err);
    console.error("Error stack:", err.stack);

    // More specific error handling
    if (err.message.includes("Could not find stored procedure")) {
      return res.status(500).json({
        message: "Stored procedure 'AuditHVTranRpt_Sp' not found in database.",
        error: err.message,
      });
    }

    if (err.message.includes("parameter")) {
      return res.status(500).json({
        message: "Parameter mismatch in stored procedure call.",
        error: err.message,
      });
    }

    res.status(500).json({
      message: "Failed to fetch high value transactions report data.",
      error: err.message,
    });
  }
});

// API endpoint to save document data to Document_Tbl
app.post("/api/document", optionalAuthForReports, async (req, res) => {
  console.log("POST /api/document - Start");
  console.log("Request body:", req.body);

  try {
    const { compCode, section, keyword, details, userName } = req.body;

    // Validate required parameters
    if (!compCode || !section || !keyword || !details || !userName) {
      console.log("Missing required parameters");
      return res.status(400).json({
        message:
          "All fields (compCode, section, keyword, details, userName) are required.",
        error: "Missing parameters",
      });
    }

    console.log(
      `Saving document with compCode: ${compCode}, section: ${section}, keyword: ${keyword}, userName: ${userName}`
    );

    if (!globalPool) {
      throw new Error("Database connection not available");
    }

    const request = globalPool.request();

    // Execute INSERT statement
    const insertQuery = `
      INSERT INTO [dbo].[Document_Tbl]
      ([CompCode], [Section], [Keyword], [Details], [UserName])
      VALUES (@CompCode, @Section, @Keyword, @Details, @UserName)
    `;

    request.input("CompCode", sql.VarChar(50), compCode);
    request.input("Section", sql.VarChar(50), section);
    request.input("Keyword", sql.VarChar(255), keyword);
    request.input("Details", sql.NVarChar(sql.MAX), details);
    request.input("UserName", sql.VarChar(50), userName);

    console.log("Executing INSERT query");
    const result = await request.query(insertQuery);

    console.log("Document saved successfully");
    console.log("Rows affected:", result.rowsAffected[0]);

    res.json({
      success: true,
      message: "Document saved successfully",
      rowsAffected: result.rowsAffected[0],
    });
  } catch (err) {
    console.error("Error in /api/document:", err.message);
    console.error("Full error details:", err);
    console.error("Error stack:", err.stack);

    // More specific error handling
    if (err.message.includes("Invalid object name")) {
      return res.status(500).json({
        message: "Table 'Document_Tbl' not found in database.",
        error: err.message,
      });
    }

    if (err.message.includes("column") || err.message.includes("Column")) {
      return res.status(500).json({
        message: "Database column error. Please check table structure.",
        error: err.message,
      });
    }

    res.status(500).json({
      message: "Failed to save document. Please try again later.",
      error: err.message,
    });
  }
});

// API endpoint to fetch existing keywords from Document_Tbl
app.get("/api/keywords", async (req, res) => {
  console.log("GET /api/keywords - Start");

  try {
    const { search } = req.query;

    if (!globalPool) {
      throw new Error("Database connection not available");
    }

    const request = globalPool.request();

    // Query to get distinct keywords, optionally filtered by search term
    let query =
      "SELECT Keyword FROM [dbo].[Document_Tbl] WHERE Keyword IS NOT NULL AND Keyword != '' ORDER BY Keyword";

    if (search && search.trim()) {
      query =
        "SELECT Keyword FROM [dbo].[Document_Tbl] WHERE Keyword IS NOT NULL AND Keyword != '' AND Keyword LIKE @SearchTerm ORDER BY Keyword";
      request.input("SearchTerm", sql.VarChar(255), `%${search.trim()}%`);
      console.log("Searching keywords with term:", search.trim());
    }

    console.log("Executing query:", query);
    const result = await request.query(query);

    console.log("Keywords fetched successfully");
    console.log(
      "Keywords count:",
      result.recordset ? result.recordset.length : 0
    );

    // Extract keyword values from the result
    const keywords = result.recordset
      ? result.recordset.map((row) => row.Keyword)
      : [];

    res.json({
      success: true,
      keywords: keywords,
      count: keywords.length,
    });
  } catch (err) {
    console.error("Error in /api/keywords:", err.message);
    console.error("Full error details:", err);

    res.status(500).json({
      message: "Failed to fetch keywords. Please try again later.",
      error: err.message,
    });
  }
});

// API endpoint to locate document by ID
app.get("/api/document/:id", async (req, res) => {
  console.log("GET /api/document/:id - Start");

  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        message: "ID parameter is required.",
        error: "Missing ID parameter",
      });
    }

    console.log("Locating document with ID:", id);

    if (!globalPool) {
      throw new Error("Database connection not available");
    }

    const request = globalPool.request();

    // Query to get document by ID
    const query = `
      SELECT ID, CompCode, Section, Keyword, Details, UserName
      FROM [dbo].[Document_Tbl] 
      WHERE ID = @ID
    `;

    request.input("ID", sql.Int, parseInt(id));

    console.log("Executing query:", query);
    const result = await request.query(query);

    console.log("Document search completed");
    console.log(
      "Records found:",
      result.recordset ? result.recordset.length : 0
    );

    if (result.recordset && result.recordset.length > 0) {
      res.json({
        success: true,
        document: result.recordset[0],
      });
    } else {
      res.status(404).json({
        success: false,
        message: `No document found with ID: ${id}`,
      });
    }
  } catch (err) {
    console.error("Error in /api/document/:id:", err.message);
    console.error("Full error details:", err);

    res.status(500).json({
      message: "Failed to locate document. Please try again later.",
      error: err.message,
    });
  }
});

// API endpoint to modify existing document

// ========== ReportDocument API Endpoints ==========

// GET /api/ProgrammeName - Get programme names from TimeSlots_tbl
app.get("/api/ProgrammeName", async (req, res) => {
  try {
    console.log("🔍 Fetching programme names from TimeSlots_tbl...");
    const pool = await getDbConnection();

    const result = await pool
      .request()
      .query(
        "SELECT DISTINCT programmeName FROM TimeSlots_tbl WHERE programmeName IS NOT NULL ORDER BY programmeName"
      );

    console.log(
      "✅ Programme names query executed, result count:",
      result.recordset.length
    );

    // Extract programme names from the result
    const programmeNames = result.recordset.map(
      (record) => record.programmeName
    );

    res.json({ programmeNames });
  } catch (err) {
    console.error("❌ Error fetching programme names:", err.message);
    res.status(500).json({
      message: "Failed to fetch programme names from database.",
      error: err.message,
    });
  }
});

// GET /api/TimeSlots - Get time slots from TimeSlots_tbl
app.get("/api/TimeSlots", async (req, res) => {
  try {
    console.log("🔍 Fetching time slots from TimeSlots_tbl...");
    const pool = await getDbConnection();

    const result = await pool
      .request()
      .query(
        "SELECT DISTINCT TimeSlots FROM TimeSlots_tbl WHERE TimeSlots IS NOT NULL ORDER BY TimeSlots"
      );

    console.log(
      "✅ Time slots query executed, result count:",
      result.recordset.length
    );

    // Extract time slots from the result
    const timeSlots = result.recordset.map((record) => record.TimeSlots);

    res.json({ timeSlots });
  } catch (err) {
    console.error("❌ Error fetching time slots:", err.message);
    res.status(500).json({
      message: "Failed to fetch time slots from database.",
      error: err.message,
    });
  }
});

// POST /api/reportdocument - Execute [dbo].[RegMembers_Sp] stored procedure
app.post("/api/reportdocument", async (req, res) => {
  try {
    const { programmeName, timeSlots } = req.body;

    console.log("🔍 Executing RegMembers_Sp with params:", {
      programmeName,
      timeSlots,
    });

    // Validate required parameters
    if (!programmeName || !timeSlots) {
      return res.status(400).json({
        message: "Programme name and time slots are required.",
        error: "Missing parameters",
      });
    }

    const pool = await getDbConnection();

    // Add timeout and optimization options
    const request = pool.request();
    request.timeout = 30000; // 30 seconds timeout

    const result = await request
      .input("Param1", sql.VarChar(50), programmeName)
      .input("Param2", sql.VarChar(50), timeSlots)
      .execute("[dbo].[RegMembers_Sp]");

    console.log(
      "✅ RegMembers_Sp executed successfully, result count:",
      result.recordset.length
    );

    // Set caching headers for better performance
    res.set({
      "Cache-Control": "public, max-age=300", // Cache for 5 minutes
      ETag: `"${Date.now()}"`,
    });

    res.json({
      success: true,
      data: result.recordset,
      message: "Report data retrieved successfully",
      timestamp: new Date().toISOString(),
      count: result.recordset.length,
    });
  } catch (err) {
    console.error("❌ Error executing RegMembers_Sp:", err.message);
    console.error("Full error details:", err);
    console.error("Parameters sent:", { programmeName, timeSlots });

    // Handle timeout specifically
    if (err.code === "ETIMEOUT" || err.message.includes("timeout")) {
      res.status(504).json({
        message: "Database query timeout. Please try again or contact support.",
        error: "Query timeout",
        details: "The query is taking longer than expected to execute",
      });
    } else {
      res.status(500).json({
        message: "Failed to execute report query.",
        error: err.message,
        details: err.code || "No error code available",
      });
    }
  }
});

// POST /api/updateAttendMember - Execute [dbo].[updateAttendMember_Sp] stored procedure
app.post("/api/updateAttendMember", async (req, res) => {
  try {
    const { phone, atnPersons } = req.body;

    console.log("🔍 Executing updateAttendMember_Sp with params:", {
      phone,
      atnPersons,
    });

    // Validate required parameters
    if (!phone || !atnPersons) {
      return res.status(400).json({
        message: "Phone and atnPersons are required.",
        error: "Missing parameters",
      });
    }

    const pool = await getDbConnection();

    const result = await pool
      .request()
      .input("phone", sql.VarChar(20), phone)
      .input("AtnPersons", sql.VarChar(10), atnPersons)
      .execute("[dbo].[updateAttendMember_Sp]");

    console.log("✅ updateAttendMember_Sp executed successfully");

    res.json({
      success: true,
      message: `Successfully updated attendance for phone: ${phone}, AtnPersons: ${atnPersons}`,
      data: result.recordset || [],
    });
  } catch (err) {
    console.error("❌ Error executing updateAttendMember_Sp:", err.message);
    res.status(500).json({
      message: "Failed to update attend member.",
      error: err.message,
    });
  }
});

// API endpoint to get row styling rules for CSS grid line coloring
app.get("/api/rowStyling", optionalAuthForReports, async (req, res) => {
  console.log("GET /api/rowStyling - Start");

  try {
    if (!globalPool) {
      throw new Error("Database connection not available");
    }

    // Define the styling rules based on your database conditions
    const stylingRules = {
      rules: [
        {
          name: "mismatchAttended",
          description: "AtnPersons ≠ RegPersons AND Status = A",
          condition: "mismatch_attended",
          color: "#e3f2fd", // Light blue background
          borderColor: "#2196f3", // Blue border
          textColor: "#0d47a1", // Dark blue text
          query:
            "SELECT RegPersons, AtnPersons, Status FROM RegMember_Details_Tbl WHERE (AtnPersons <> RegPersons) AND status = 'A'",
        },
        {
          name: "attended",
          description: "Status = A (Attended)",
          condition: "attended",
          color: "#ffebee", // Light red background
          borderColor: "#f44336", // Red border
          textColor: "#b71c1c", // Dark red text
          query: "SELECT Status FROM RegMember_Details_Tbl WHERE status = 'A'",
        },
        {
          name: "registered",
          description: "Status = R (Registered)",
          condition: "registered",
          color: "#e8f5e8", // Light green background
          borderColor: "#4caf50", // Green border
          textColor: "#2e7d32", // Dark green text
          query: "SELECT Status FROM RegMember_Details_Tbl WHERE status = 'R'",
        },
      ],
      priority: ["mismatchAttended", "attended", "registered"], // Higher priority rules first
      default: {
        color: "#ffffff", // White background
        borderColor: "#e0e0e0", // Light gray border
        textColor: "#333333", // Dark gray text
      },
    };

    console.log("✅ Row styling rules generated successfully");

    res.json({
      success: true,
      message: "Row styling rules retrieved successfully",
      data: stylingRules,
    });
  } catch (err) {
    console.error("❌ Error in /api/rowStyling:", err);
    res.status(500).json({
      success: false,
      message: "Failed to get row styling rules",
      error: err.message,
    });
  }
});

// POST /api/regMembersReport - Execute RegMembersReport_Sp stored procedure
app.post("/api/regMembersReport", async (req, res) => {
  try {
    const { programmeName, timeSlots, optionValue } = req.body;

    console.log("🔍 Executing RegMembersReport_Sp with params:", {
      programmeName,
      timeSlots,
      optionValue,
    });

    // Validate required parameters
    if (!programmeName || !timeSlots || optionValue === undefined) {
      console.log("❌ Missing required parameters:", {
        programmeName,
        timeSlots,
        optionValue,
      });
      return res.status(400).json({
        message: "Programme name, time slots, and option value are required.",
        error: "Missing parameters",
      });
    }

    const pool = await getDbConnection();

    // Add timeout and optimization options
    const request = pool.request();
    request.timeout = 30000; // 30 seconds timeout

    console.log("📡 Executing stored procedure with parameters:");
    console.log("  - Param1 (programmeName):", programmeName);
    console.log("  - Param2 (timeSlots):", timeSlots);
    console.log("  - Param3 (optionValue):", optionValue);

    // First check if the stored procedure exists
    const checkProcedure = await request.query(`
      SELECT ROUTINE_NAME 
      FROM INFORMATION_SCHEMA.ROUTINES 
      WHERE ROUTINE_TYPE = 'PROCEDURE' 
      AND ROUTINE_NAME = 'RegMembersReport_Sp'
    `);

    console.log("🔍 Stored procedure check result:", checkProcedure.recordset);

    const result = await request
      .input("Param1", sql.VarChar(50), programmeName)
      .input("Param2", sql.VarChar(50), timeSlots)
      .input("Param3", sql.Int, optionValue)
      .execute("RegMembersReport_Sp");

    console.log(
      "✅ RegMembersReport_Sp executed successfully, result count:",
      result.recordset.length
    );

    // Log first few records for debugging
    if (result.recordset.length > 0) {
      console.log("📊 Sample data (first record):", result.recordset[0]);
    }

    res.json({
      success: true,
      message: `Report generated successfully for ${
        optionValue === 1 ? "Admitted" : "Register"
      } members`,
      data: result.recordset || [],
      recordCount: result.recordset ? result.recordset.length : 0,
    });
  } catch (err) {
    console.error("❌ Error executing RegMembersReport_Sp:", err.message);
    console.error("❌ Error details:", err);
    res.status(500).json({
      message: "Failed to generate members report.",
      error: err.message,
    });
  }
});

// ========== ReportUserRight APIs ==========

// API Endpoint to get TimeSlots for Registration form dropdown
app.get("/api/timeslots-for-registration", async (req, res) => {
  try {
    console.log("🔍 Fetching time slots for registration...");
    const pool = await getDbConnection();

    const result = await pool
      .request()
      .query(
        "SELECT [TimeSlots] FROM [dbo].[TimeSlots_tbl] WHERE [TimeSlots] <> 'ALL'"
      );

    const timeSlots = result.recordset.map((record) => record.TimeSlots);
    console.log(
      "✅ Time slots fetched successfully:",
      timeSlots.length,
      "records"
    );

    res.json({
      success: true,
      timeSlots: timeSlots,
    });
  } catch (err) {
    console.error("❌ Error fetching registration time slots:", err.message);
    res.status(500).json({
      success: false,
      message: "Failed to fetch time slots.",
      error: err.message,
    });
  }
});

// API Endpoint to save new registration using stored procedure
app.post("/api/register-member", async (req, res) => {
  try {
    const { name, phone, noOfPerson, timeSlot } = req.body;

    console.log("🔍 Register member request:", {
      name,
      phone,
      noOfPerson,
      timeSlot,
    });

    // Basic validation
    if (!name || !phone || !noOfPerson || !timeSlot) {
      return res.status(400).json({
        success: false,
        message: "Name, Phone, NoofPerson, and TimeSlot are required.",
      });
    }

    const pool = await getDbConnection();

    console.log(
      "📡 Executing stored procedure: [dbo].[InsertUpdate_RegMaster_Sp]"
    );

    const result = await pool
      .request()
      .input("Name", sql.VarChar(100), name)
      .input("Phone", sql.VarChar(20), phone)
      .input("RegPersons", sql.Int, parseInt(noOfPerson))
      .input("TimeSlot", sql.VarChar(50), timeSlot)
      .execute("[dbo].[InsertUpdate_RegMaster_Sp]");

    console.log("✅ Registration successful for:", name);

    res.json({
      success: true,
      message: "Registration successful!",
    });
  } catch (err) {
    console.error("❌ Error executing InsertUpdate_RegMaster_Sp:", err.message);
    res.status(500).json({
      success: false,
      message: "Failed to save registration.",
      error: err.message,
    });
  }
});

// ========== SERVER STARTUP ==================
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
process.on("SIGINT", async () => {
  console.log("Shutting down gracefully...");
  if (globalPool) {
    await globalPool.close();
    console.log("Database connection closed");
  }
  process.exit(0);
});

// Start the server
startServer();
