import * as process from "process";
import * as fs from "fs";
import * as path from "path";
import {
  parseTestcase,
  filterTestcases,
} from "./utils";

import log from 'testsolar-oss-sdk/src/testsolar_sdk/logger';

import {
  LoadError,
  LoadResult,
} from "testsolar-oss-sdk/src/testsolar_sdk/model/load";
import { TestCase } from "testsolar-oss-sdk/src/testsolar_sdk/model/test";

import Reporter from "testsolar-oss-sdk/src/testsolar_sdk/reporter";

// 定义正则表达式来匹配Cypress测试用例
const cypressTestRegex = /it\(['"`](.*?)['"`],\s*\(.*?\)\s*=>/g;

export async function collectTestCases(
  projPath: string,
  testSelectors: string[],
): Promise<LoadResult> {
  const test: TestCase[] = [];
  const loadError: LoadError[] = [];
  const result = new LoadResult(test, loadError);

  try {
    // 进入projPath目录
    process.chdir(projPath);
    log.info(`Current directory: ${process.cwd()}`);

    // 扫描Cypress测试用例
    const cypressTestCases = scanCypressTestFiles(projPath);
    log.info("Cypress test cases file: ", cypressTestCases);

    // 默认true， 有值则为false
    const fileMode = !process.env.TESTSOLAR_TTP_FILEMODE;

    let loadCaseResult;
    if (fileMode) {
      log.info("TESTSOLAR_TTP_FILEMODE is set, using file paths directly without parsing");
      loadCaseResult = cypressTestCases;
    } else {
      // 如果环境变量未设置，则按原来的方式解析用例
      loadCaseResult = parseTestcase(projPath, cypressTestCases);
    }

    log.info("Cypress testtool parse all testcases: \n", loadCaseResult);

    // 过滤用例
    let filterResult;
    if (testSelectors && testSelectors.length > 0) {
      if (testSelectors.length === 1 && testSelectors[0] === ".") {
        filterResult = loadCaseResult;
      } else {
        filterResult = await filterTestcases(
          testSelectors,
          loadCaseResult,
          false,
        );
      }
    } else {
      filterResult = loadCaseResult;
    }
    log.info("filter testcases: ", filterResult);

    // 提取用例数据
    filterResult.forEach((filteredTestCase: string) => {
      let test
      if (fileMode) {
        // 去掉前缀 projectPath，获取相对路径
        const relativePath = path.relative(projPath, filteredTestCase);
        test = new TestCase(relativePath, {});
      } else {
        const [path, descAndName] = filteredTestCase.split("?");
        test = new TestCase(`${path}?${descAndName}`, {});
      }
      result.Tests.push(test);
    });
  } catch (error: unknown) {
    const errorMessage =
      (error as Error).message ||
      "Parse json file error, please check the file content!";
    console.error(errorMessage);

    // 将 testSelectors 中的每个元素作为 Name 添加到 LoadError 中
    testSelectors.forEach(selector => {
      const loadErrorInstance = new LoadError(selector, errorMessage);
      result.LoadErrors.push(loadErrorInstance);
    });
  }

  return result;
}

// 扫描目录中的Cypress测试文件（排除node_modules）
function scanCypressTestFiles(directory: string): string[] {
  const testCases: string[] = [];

  function readDirRecursive(dir: string) {
    // 如果路径中包含node_modules，则跳过该目录
    if (dir.includes("node_modules")) {
      return;
    }

    try {
      const files = fs.readdirSync(dir);

      files.forEach((file) => {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
          readDirRecursive(fullPath);
        } else if (file.endsWith(".cy.js") || file.endsWith(".cy.ts")) {
          const content = fs.readFileSync(fullPath, "utf-8");
          if (cypressTestRegex.test(content)) {
            testCases.push(fullPath);
          }
          // 重置正则表达式的lastIndex，以便下次使用
          cypressTestRegex.lastIndex = 0;
        }
      });
    } catch (error) {
      console.error(`Error reading directory ${dir}:`, error);
    }
  }

  readDirRecursive(directory);
  return testCases;
}

export async function loadTestCasesFromFile(filePath: string): Promise<void> {
  log.info("Pipe file: ", filePath);

  const fileContent = fs.readFileSync(filePath, "utf-8");
  const data = JSON.parse(fileContent);
  log.info(`Pipe file content:\n${JSON.stringify(data, null, 2)}`);
  const testSelectors = data.TestSelectors || [];
  const projPath = data.ProjectPath;
  const taskId = data.TaskId;

  log.info("generate demo load result");
  const loadResults: LoadResult = await collectTestCases(
    projPath,
    testSelectors,
  );

  const reporter = new Reporter(taskId, data.FileReportPath);
  await reporter.reportLoadResult(loadResults);
}
