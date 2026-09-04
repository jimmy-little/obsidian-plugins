#!/usr/bin/env node
"use strict";
const { readFileSync } = require("fs");
const { join } = require("path");
console.error(readFileSync(join(__dirname, "BUILD.txt"), "utf8"));
process.exit(1);
