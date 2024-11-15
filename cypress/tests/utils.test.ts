import { describe, expect, test, beforeEach, afterEach, jest } from "@jest/globals";
import * as fs from "fs";
import * as path from "path";
import {
  executeCommand,
  isFileOrDirectory,
  filterTestcases,
  parseTestcase,
  generateCommands,
  parseJsonContent,
  createTempDirectory,
  parseJsonFile,
  groupTestCasesByPath,
  createTestResults,
  generateCoverageJson, 
  sleep,
} from "../src/cypressx/utils";

import log from 'testsolar-oss-sdk/src/testsolar_sdk/logger';

// executeCommand
describe("executeCommand", () => {
  test("should execute a command and return stdout and stderr", async () => {
    const command = 'echo "Hello World"';
    const result = await executeCommand(command);
    expect(result.stderr).toBe("");
  });

  test("should handle command execution errors", async () => {
    const command = "";
    await expect(executeCommand(command)).rejects.toThrowError("The argument 'file' cannot be empty. Received ''");
  });
});

// isFileOrDirectory
describe("isFileOrDirectory", () => {
  test("should return 1 for files", async () => {
    const result = await isFileOrDirectory("src/jestx/utils.ts");
    expect(result).toBe(1);
  });

  test("should return -1 for directories", async () => {
    const result = await isFileOrDirectory("src/jestx");
    expect(result).toBe(-1);
  });

  test("should r置超时时eturn 0 for neither file nor directory", async () => {
    log.info("Testing unknown path...");
    const testUnknown = path.join(__dirname, "unknown");
    const result = isFileOrDirectory(testUnknown);
    log.info("Unknown path test complete.");
    expect(result).toBe(0);
  }, 10000);

  test("should reject for non-existent paths", async () => {
    log.info("Testing non-existent path...");
    expect(isFileOrDirectory("path/to/nonexistent"));
    log.info("Non-existent path test complete.");
  }, 10000);

});

// filterTestcases
describe("filterTestcases", () => {
  test("should filter test cases based on selectors", async () => {
    const testSelectors = ["tests", "test2"];
    const parsedTestcases = ["tests/utils.test.ts", "test2", "test3"];
    const result = await filterTestcases(testSelectors, parsedTestcases);
    expect(result).toEqual(["tests/utils.test.ts", "test2"]);
  });

  test("should filter test cases based on none selectors", async () => {
    const testSelectors: string[] = [];
    const parsedTestcases = ["test1", "test2"];
    const result = await filterTestcases(testSelectors, parsedTestcases, true);
    expect(result).toEqual(["test1", "test2"]);
  });

  test("should exclude test cases based on selectors when exclude is true", async () => {
    const testSelectors = ["test1", "test2"];
    const parsedTestcases = ["test1", "test2", "test3"];
    const result = await filterTestcases(testSelectors, parsedTestcases, true);
    expect(result).toEqual(["test3"]);
  });
});

// parseTestcase
describe("parseTestcase", () => {
  test("should parse test cases from file data", () => {
    const projPath = "tests";
    const fileData = ["tests/utils.test.ts"];
    const result = parseTestcase(projPath, fileData);
    expect(result).toEqual(
      expect.arrayContaining(["utils.test.ts?executeCommand should execute a command and return stdout and stderr"]),
    );
  });

  test("should parse single test cases from file data", () => {
    const projPath = "tests";
    const fileData = ["tests/demo.test.ts"];
    const result = parseTestcase(projPath, fileData);
    expect(result).toEqual(
      ["demo.test.ts?demo"]
    );
  });
});

// generateCommands
describe("generateCommands", () => {
  test("should generate test execution commands", () => {
    const path = "path/to/tests";
    const testCases = ["test1", "test2"];
    const jsonName = "results.json";
    const command = generateCommands(path, testCases, jsonName);
    expect(command).toContain("npx jest");
  });

  test("should generate zero test execution commands", () => {
    const path = "path/to/tests";
    const testCases: string[] = [];
    const jsonName = "results.json";
    const command = generateCommands(path, testCases, jsonName);
    expect(command).toContain("npx jest");
  });
});

// parseJsonFile
describe("parseJsonFile", () => {
  test("should parse JSON file and return case results", () => {
    const projPath = "tests";
    const jsonName = "tests/results.json";
    const result = parseJsonFile(projPath, jsonName);
    const expectedResults = {
      "items/common.test.js?test_items": {
        result: "passed",
        duration: 10000,
        startTime: 1610000000000,
        endTime: 1610000010000,
        message: "",
        content: "",
      },
    };
    expect(result).toEqual(expectedResults);
  });
});

// parseJsonContent
describe("parseJsonContent", () => {
  test("should parse JSON content and return case results", () => {
    const projPath = "path/to/project";
    const data = {
      "stats": {
        "start": "2024-11-15T01:34:18.404Z",
        "end": "2024-11-15T01:34:21.315Z",
      },
      "results": [
        {
          "fullFile": "cypress/e2e/cases/WebLogin/webLogin.cy.js",
          "suites": [
            {
              "tests": [
                {
                  "title": "web登录",
                  "fullTitle": "WebLogin web登录",
                  "timedOut": null,
                  "duration": 1177,
                  "state": "passed",
                  "speed": "fast",
                  "pass": true,
                  "fail": false,
                  "pending": false,
                  "context": null,
                  "code": "// 填写手机号\ncy.get('#signup-form .phone-num input').type('13713800000');\n// 获取验证码\n// cy.get('#signup-form .phone-verify .sms-code').click()\n// cy.wait(1000)\n// 填写验证码\ncy.get('#signup-form .phone-verify input').type('111222');\n// 点击登录\ncy.get('.login-box .login-btn').click();",
                  "err": {},
                  "uuid": "adf74827-4f81-4c6c-8f0b-78bf6bf5a681",
                  "parentUUID": "809c985d-8b3a-4353-b6fa-17eaf2dcb934",
                  "isHook": false,
                  "skipped": false
                }
              ],
              "duration": 1177
            }
          ]
        }
      ]
    };
    const result = parseJsonContent(projPath, data);
    expect(result).toEqual(expect.any(Object));
  });
});

// createTempDirectory
describe("createTempDirectory", () => {
  test("should create a temporary directory", () => {
    const tempDirectory = createTempDirectory();
    expect(tempDirectory).toContain("caseOutPut");
  });
});


// groupTestCasesByPath
describe("groupTestCasesByPath", () => {
  test("should group test cases by path", () => {
    const testcases = [
      "tests/utils.test.js?sum module adds 1 + 2 to equal 3",
      "tests/utils.test.js",
    ];
    const result = groupTestCasesByPath(testcases);
    expect(result).toEqual({
      "tests/utils.test.js": ["sum module adds 1 + 2 to equal 3", ""],
    });
  });
});

// createTestResults
describe("createTestResults", () => {
  test("should create TestResult instances from spec results", () => {
    const output = {
      "path/to/testcase": {
        result: "passed",
        duration: 100,
        startTime: 1610000000000,
        endTime: 1610000010000,
        message: "Test passed",
        content: "Test passed",
      },
    };
    const testResults = createTestResults(output);
    expect(testResults).toEqual(expect.arrayContaining([expect.any(Object)]));
  });
});

describe("sleep", () => {
  jest.useFakeTimers();

  test("should resolve after the specified time", () => {
    const ms = 1000;
    const promise = sleep(ms);

    jest.advanceTimersByTime(ms);

    return expect(promise).resolves.toBeUndefined();
  });
});

describe("generateCoverageJson", () => {
  const projectPath = "tests";
  const fileReportPath = "tests/testdata";
  const coverageDir = path.join(projectPath, "coverage");
  const cloverXmlPath = path.join(projectPath, "clover.xml");
  const targetCloverXmlPath = path.join(coverageDir, "clover.xml");
  const coverageFileName = "testsolar_coverage";
  const coverageJsonDir = path.join(projectPath, coverageFileName);

  beforeEach(() => {
    jest.clearAllMocks();

    // 创建 coverage 目录
    if (!fs.existsSync(coverageDir)) {
      fs.mkdirSync(coverageDir);
    }

    // 复制 clover.xml 文件到 coverage 目录
    if (fs.existsSync(cloverXmlPath)) {
      fs.copyFileSync(cloverXmlPath, targetCloverXmlPath);
    }
  });

  afterEach(() => {
    // 清理 coverage 目录中的 clover.xml 文件
    if (fs.existsSync(targetCloverXmlPath)) {
      fs.unlinkSync(targetCloverXmlPath);
    }

    // 清理生成的 JSON 文件
    if (fs.existsSync(coverageJsonDir)) {
      const files = fs.readdirSync(coverageJsonDir);
      files.forEach(file => fs.unlinkSync(path.join(coverageJsonDir, file)));
    }
  });

  test("should log an error if clover.xml file does not exist", () => {
    // 确保 clover.xml 文件不存在
    if (fs.existsSync(targetCloverXmlPath)) {
      fs.unlinkSync(targetCloverXmlPath);
    }

    // 监听 log.error 的调用
    const logErrorSpy = jest.spyOn(log, "error");

    // 调用函数
    generateCoverageJson(projectPath, fileReportPath);

    // 检查 log.error 是否被调用以及调用参数是否正确
    expect(logErrorSpy).toHaveBeenCalledWith(`Clover XML file not found at ${targetCloverXmlPath}`);
  });
});

