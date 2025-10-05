# Backend Server - Database Connection Required

## Current Configuration: Real Database Only

The backend server has been configured to **ONLY** work with a real database connection. No mock data is provided.

### Requirements:
- ✅ Database connection to `172.27.0.70:1433` is **REQUIRED**
- ✅ Server will **NOT START** without database connectivity
- ✅ All API endpoints return real data from database or error messages
- ✅ No fallback mock data - database connection is mandatory

### Database Configuration:
Current `.env` file in backend:
```
DB_USER=sFedbAdmins
DB_PASSWORD=Safe@425262$
DB_SERVER=172.18.0.4
DB_NAME=NEERICODE_WEB
PORT=4000
```

### Server Behavior:
1. **Database Connection Check**: Server attempts database connection on startup
2. **Success**: Server starts and serves real data
3. **Failure**: Server exits with error message - no mock data served

### API Endpoints (Database Required):
- `GET /api/health` - Server status (shows database connectivity)
- `GET /api/branches` - Real branch list from `Gen_BranchDetails_P_Tbl`
- `POST /api/reports/high-value` - Real transaction data from `HighValueTransactionReport_SP`
- `POST /api/login` - User authentication from `Tbl_UserMaster`
- `POST /api/issues` - Issue submission to `Tbl_IssueMaster`
- `POST /api/complaint-report` - Complaint data from `ComplaintRegister_Sp`

### To Fix Database Connection:
1. **Check Network**: Ensure `172.27.0.70:1433` is accessible
2. **Verify Credentials**: Confirm database user/password are correct
3. **Test Connection**: Use SQL Server Management Studio or similar tool
4. **Update Environment**: Modify `.env` file if credentials/server changes

### Next Steps:
1. Resolve network connectivity to database server
2. Start server - it will only run with successful database connection
3. Test API endpoints with real data
