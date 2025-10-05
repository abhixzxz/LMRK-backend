const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

// Generate a secure secret for JWT (in production, use environment variable)
const JWT_SECRET =
  process.env.JWT_SECRET ||
  "your-super-secret-jwt-key-change-this-in-production";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "24h";
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || "7d";

/**
 * Generate JWT access token
 * @param {Object} payload - User data to include in token
 * @returns {String} JWT token
 */
const generateAccessToken = (payload) => {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
};

/**
 * Generate JWT refresh token
 * @param {Object} payload - User data to include in token
 * @returns {String} JWT refresh token
 */
const generateRefreshToken = (payload) => {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_REFRESH_EXPIRES_IN });
};

/**
 * Verify JWT token
 * @param {String} token - JWT token to verify
 * @returns {Object} Decoded token payload
 */
const verifyToken = (token) => {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    throw new Error("Invalid or expired token");
  }
};

/**
 * Hash password using bcrypt
 * @param {String} password - Plain text password
 * @returns {String} Hashed password
 */
const hashPassword = async (password) => {
  const saltRounds = 12;
  return await bcrypt.hash(password, saltRounds);
};

/**
 * Compare password with hash
 * @param {String} password - Plain text password
 * @param {String} hash - Hashed password
 * @returns {Boolean} Password match result
 */
const comparePassword = async (password, hash) => {
  return await bcrypt.compare(password, hash);
};

/**
 * JWT Authentication Middleware
 * Protects routes by verifying JWT token
 */
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Access token required",
    });
  }

  try {
    const decoded = verifyToken(token);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(403).json({
      success: false,
      message: "Invalid or expired token",
      error: error.message,
    });
  }
};

/**
 * Optional JWT Authentication Middleware - FOR REPORTS
 * Allows requests through without authentication for reports
 */
const optionalAuthForReports = (req, res, next) => {
  console.log(
    "Optional auth for reports - allowing request without authentication"
  );

  // Set a dummy user for any code that might expect req.user
  req.user = {
    userId: 1,
    username: "system",
    role: "admin",
  };

  next();
};

/**
 * Optional JWT Authentication Middleware
 * Extracts user info if token exists, but doesn't require it
 */
const optionalAuth = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (token) {
    try {
      const decoded = verifyToken(token);
      req.user = decoded;
    } catch (error) {
      // Token exists but is invalid - we'll still proceed but without user info
      console.warn("Invalid token provided:", error.message);
    }
  }

  next();
};

/**
 * Role-based access control middleware
 * @param {Array} allowedRoles - Array of roles that can access the route
 */
const requireRole = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "Insufficient permissions",
      });
    }

    next();
  };
};

/**
 * Refresh token validation
 * Validates refresh token and generates new access token
 */
const refreshAccessToken = (req, res, next) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(401).json({
      success: false,
      message: "Refresh token required",
    });
  }

  try {
    const decoded = verifyToken(refreshToken);

    // Generate new access token
    const newAccessToken = generateAccessToken({
      userId: decoded.userId,
      username: decoded.username,
      role: decoded.role,
    });

    res.json({
      success: true,
      message: "Token refreshed successfully",
      data: {
        accessToken: newAccessToken,
        user: {
          userId: decoded.userId,
          username: decoded.username,
          role: decoded.role,
        },
      },
    });
  } catch (error) {
    return res.status(403).json({
      success: false,
      message: "Invalid refresh token",
      error: error.message,
    });
  }
};

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  verifyToken,
  hashPassword,
  comparePassword,
  authenticateToken,
  optionalAuth,
  optionalAuthForReports,
  requireRole,
  refreshAccessToken,
  JWT_SECRET,
};
