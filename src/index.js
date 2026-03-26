const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "..", ".env") });

const app = require("./service.js");

console.log("[startup] AUTH DEBUG BUILD LOADED");

const port = process.env.PORT || process.argv[2] || 3000;
app.listen(port, () => {
  console.log(`Server started on port ${port}`);
});
