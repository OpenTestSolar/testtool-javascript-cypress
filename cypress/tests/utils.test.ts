import { describe, expect, test, beforeEach, afterEach, jest } from "@jest/globals";
import * as fs from "fs";
import * as path from "path";
import { tmpdir } from 'os';
import { promisify } from 'util';

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
  sleep,
  scanCypressScreenshots,
} from "../src/cypressx/utils";

import log from 'testsolar-oss-sdk/src/testsolar_sdk/logger';


const mkdtemp = promisify(fs.mkdtemp);
const writeFile = promisify(fs.writeFile);
const rmdir = promisify(fs.rm);

describe("executeCommand", () => {
  test("should execute a command and return success, stdout and stderr", async () => {
    const command = 'echo "Hello World"';
    const result = await executeCommand(command);
    expect(result.success).toBe(true);
    expect(result.stdout).toContain("Hello World");
    expect(result.stderr).toBe("");
  });

  test("should handle command execution errors", async () => {
    const command = "nonexistentcommand";
    const result = await executeCommand(command);
    expect(result.success).toBe(false);
    expect(result.stderr).not.toBe("");
  });
});


describe("isFileOrDirectory", () => {
  test("should return 1 for files", async () => {
    const result = await isFileOrDirectory("src/cypressx/utils.ts");
    expect(result).toBe(1);
  });

  test("should return -1 for directories", async () => {
    const result = await isFileOrDirectory("src/cypressx");
    expect(result).toBe(-1);
  });

  test("should return 0 for neither file nor directory", async () => {
    const testUnknown = path.join(__dirname, "unknown");
    const result = await isFileOrDirectory(testUnknown);
    expect(result).toBe(0);
  });

});

// filterTestcases
describe("filterTestcases", () => {
  test("should filter test cases based on selectors", async () => {
    const testSelectors = ["tests", "test2"];
    const parsedTestcases = ["tests/utils.test.ts", "test2", "test3"];
    const result = await filterTestcases(testSelectors, parsedTestcases);
    expect(result).toEqual(["tests/utils.test.ts", "test2"]);
  });


  test("should exclude test cases based on selectors when exclude is true", async () => {
    const testSelectors = ["test1", "test2"];
    const parsedTestcases = ["test1", "test2", "test3"];
    const result = await filterTestcases(testSelectors, parsedTestcases, true);
    expect(result).toEqual(["test3"]);
  });
});

describe("parseTestcase", () => {

  test("should parse test cases from file data", () => {
    const projPath = "tests";
    const fileData = ["tests/utils.test.ts"];
    const result = parseTestcase(projPath, fileData);
    expect(result).toEqual(
      expect.arrayContaining(["utils.test.ts?executeCommand should execute a command and return success, stdout and stderr", "utils.test.ts?executeCommand should handle command execution errors", "utils.test.ts?isFileOrDirectory should return 1 for files", "utils.test.ts?isFileOrDirectory should return -1 for directories", "utils.test.ts?isFileOrDirectory should return 0 for neither file nor directory", "utils.test.ts?filterTestcases should filter test cases based on selectors", "utils.test.ts?filterTestcases should exclude test cases based on selectors when exclude is true", "utils.test.ts?parseTestcase should parse test cases from file data", "utils.test.ts?parseTestcase should parse single test cases from file data", "utils.test.ts?generateCommands should generate Cypress test execution commands"]),
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
  test("should generate Cypress test execution commands", () => {
    const filePath = "path/to/tests/test.cy.js";
    const testCases = ["Test Case 1", "Test Case 2"];
    const jsonName = "results.json";
    const command = generateCommands(filePath, testCases, jsonName);
    expect(command).toContain("npx cypress run");
    expect(command).toContain(`--spec "${filePath}"`);
    expect(command).toContain(`reportFilename="${jsonName}"`);
  });
});

// parseJsonFile
describe("parseJsonFile", () => {
  test("should parse JSON file and return case results", () => {
    const projPath = "tests";
    const jsonName = "tests/results.json";
    const result = parseJsonFile(projPath, jsonName);
    const expectedResults = {
      "../cypress/e2e/cases/esscard-h5-project/packages/ess-open-auth-next/src/normal-auth.cy.js?免密显示授权 checkAppid返回值检查": {
        result: "passed",
        duration: 1555,
        startTime: 1731661187264,
        endTime: 1731661192164,
        message: "",
        content: "\n\n",
        description: "免密显示授权",
        attachments: []

      },
    };
    expect(result).toEqual(expectedResults);
  });
});


describe("parseJsonContent", () => {
  test("should parse JSON content and return case results", () => {
    const projPath = "path/to/project";
    const data = {
      stats: {
        start: "2024-11-15T01:34:18.404Z",
        end: "2024-11-15T01:34:21.315Z",
      },
      results: [
        {
          fullFile: "cypress/e2e/cases/WebLogin/webLogin.cy.js",
          suites: [
            {
              title: "WebLogin",
              tests: [
                {
                  title: "web登录",
                  fullTitle: "WebLogin web登录",
                  duration: 1177,
                  state: "passed",
                  code: "test code",
                  err: {}
                }
              ]
            }
          ]
        }
      ]
    };
    const result = parseJsonContent(projPath, data);
    expect(result).toEqual({
      '../../../cypress/e2e/cases/WebLogin/webLogin.cy.js?WebLogin web登录': {
        result: 'passed',
        duration: 1177,
        startTime: 1731634458404,
        endTime: 1731634461315,
        message: '',
        content: 'test code\n\n',
        description: 'WebLogin',
        attachments: []
      }
    })
  });
});

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
        description: "Test description"
      },
    };
    const testResults = createTestResults(output);
    expect(testResults).toHaveLength(1);
    expect(testResults[0]).toHaveProperty('Test');
    expect(testResults[0]).toHaveProperty('StartTime');
    expect(testResults[0]).toHaveProperty('EndTime');
    expect(testResults[0]).toHaveProperty('ResultType');
    expect(testResults[0]).toHaveProperty('Message');
    expect(testResults[0]).toHaveProperty('Steps');
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
        description: "Test description"
      },
    };
    const testResults = createTestResults(output);
    expect(testResults).toHaveLength(1);
    expect(testResults[0]).toHaveProperty('Test');
    expect(testResults[0]).toHaveProperty('StartTime');
    expect(testResults[0]).toHaveProperty('EndTime');
    expect(testResults[0]).toHaveProperty('ResultType');
    expect(testResults[0]).toHaveProperty('Message');
    expect(testResults[0]).toHaveProperty('Steps');
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

  afterAll(() => {
    jest.useRealTimers();
  });
});


describe('scanCypressScreenshots', () => {
  let tempDir: string;
  let projPath: string;

  beforeAll(async () => {
    // 创建临时项目目录结构
    tempDir = await mkdtemp(path.join(tmpdir(), 'cypress-test-'));
    projPath = path.join(tempDir, 'project');
    
    // 创建标准的 Cypress 目录结构
    fs.mkdirSync(path.join(projPath, 'cypress', 'screenshots'), { recursive: true });
  });

  afterAll(async () => {
    await rmdir(tempDir, { recursive: true });
  });

  it('应该返回空对象当截图目录不存在', () => {
    const nonExistPath = path.join(projPath, 'non-exist');
    const result = scanCypressScreenshots(nonExistPath);
    
    expect(result).toEqual({});
  });

  it('应该返回空对象当目录存在但没有截图', () => {
    const result = scanCypressScreenshots(projPath);
    expect(result).toEqual({});
  });

  it('应该正确解析单spec目录的截图文件', async () => {
    // 准备测试数据
    const specDir = path.join(projPath, 'cypress', 'screenshots', 'login.spec.ts');
    fs.mkdirSync(specDir, { recursive: true });
    
    // 创建测试截图文件
    await writeFile(
      path.join(specDir, 'Login Page -- should display error message (failed).png'),
      'mock'
    );
    await writeFile(
      path.join(specDir, 'Login Page -- should login successfully.png'),
      'mock'
    );

    // 执行测试
    const result = scanCypressScreenshots(projPath);

    // 验证结果
    expect(Object.keys(result)).toHaveLength(2);
  });

  it('应该处理多个spec目录的情况', async () => {
    // 准备测试数据
    const specDirs = [
      path.join(projPath, 'cypress', 'screenshots', 'login.spec.ts'),
      path.join(projPath, 'cypress', 'screenshots', 'profile.spec.ts')
    ];
    
    await Promise.all(specDirs.map(async (dir) => {
      fs.mkdirSync(dir, { recursive: true });
      await writeFile(
        path.join(dir, 'Test Suite -- test case (failed).png'),
        'mock'
      );
    }));

    // 执行测试
    const result = scanCypressScreenshots(projPath);

    // 验证结果
    expect(Object.keys(result)).toHaveLength(4);
    expect(result['login.spec.ts?Test Suite test case']).toBeDefined();
    expect(result['profile.spec.ts?Test Suite test case']).toBeDefined();
  });
});