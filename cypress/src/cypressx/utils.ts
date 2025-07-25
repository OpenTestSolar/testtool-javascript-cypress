import * as process from "process";
import * as child_process from "child_process";
import * as util from "util";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { promisify } from 'util';

import log from 'testsolar-oss-sdk/src/testsolar_sdk/logger';
import { TestCase } from "testsolar-oss-sdk/src/testsolar_sdk/model/test";
import {
  TestResult,
  TestCaseStep,
  TestCaseLog,
  LogLevel,
  ResultType,
  AttachmentType,
  Attachment,
} from "testsolar-oss-sdk/src/testsolar_sdk/model/testresult";

const exec = util.promisify(child_process.exec);


export interface SpecResult {
  result: string;
  duration: number;
  startTime: number;
  endTime: number;
  message: string;
  content: string;
  description?: string;
  attachments?: Attachment[];
}


interface JsonData {
  stats: {
    start: string;
    end: string;
  };
  results: Array<{
    fullFile: string;
    suites: Array<{
      title?: string;
      tests: Array<{
        fullTitle: string;
        duration: number;
        state: string;
        code: string;
        err: {
          message?: string;
          estack?: string;
        };
      }>;
    }>;
  }>;
}


// 执行命令并返回结果
export async function executeCommand(command: string): Promise<{ success: boolean; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await execAsync(command);
    return { success: true, stdout, stderr };
  } catch (error) {
    const typedError = error as Error & { stdout: string; stderr: string };
    // 记录错误日志
    log.error(`Error executing command: ${command}`);
    log.error(`Error message: ${typedError.message}`);
    log.error(`stdout: ${typedError.stdout}`);
    log.error(`stderr: ${typedError.stderr}`);
    
    // 返回错误信息，而不是抛出错误
    return {
      success: false,
      stdout: typedError.stdout || '',
      stderr: typedError.stderr || typedError.message
    };
  }
}

// 判断路径是文件还是目录
export const isFileOrDirectory = (filePath: string) => {
  try {
    const stats = fs.statSync(filePath);
    if (stats.isFile()) {
      return 1; // 文件
    } else {
      return -1; // 目录
    }
  } catch (err) {
    return 0; // 其他类型
  }
};

// 根据选择器过滤测试用例
export const filterTestcases = async (
  testSelectors: string[],
  parsedTestcases: string[],
  exclude: boolean = false,
): Promise<string[]> => {
  if (testSelectors.length === 0) {
    return parsedTestcases;
  }
  const filteredTestcases: string[] = [];

  for (const testCase of parsedTestcases) {
    let matched = false;

    for (const selector of testSelectors) {
      const fileType = isFileOrDirectory(selector);
      if (fileType === -1) {
        // 如果selector是目录路径，检查testCase是否包含selector + '/' 避免文件名与用例名重复
        if (testCase.includes(selector + "/")) {
          matched = true;
          break;
        }
      } else {
        if (testCase.includes(selector)) {
          matched = true;
          break;
        }
      }
    }

    // 根据 exclude 参数，确定是否将匹配的测试用例包含在结果中
    if (exclude && !matched) {
      filteredTestcases.push(testCase);
    } else if (!exclude && matched) {
      filteredTestcases.push(testCase);
    }
  }

  return filteredTestcases;
};

// 解析测试用例
export const parseTestcase = (
  projPath: string,
  fileData: string[],
): string[] => {
  const testcases: string[] = [];

  // 遍历所有文件
  for (const filePath of fileData) {
    const relativePath = path.relative(projPath, filePath);
    // 读取文件内容
    const fileContent = fs.readFileSync(filePath, "utf-8");

    // 将文件内容按行分割
    const lines = fileContent.split("\n");

    // 初始化 describeContent 变量
    let describeContent = "";

    // 遍历每一行
    for (const line of lines) {
      // 匹配 describe 标签
      const describeMatch = line.match(/describe\(['"](.*?)['"],/);
      if (describeMatch) {
        // 更新 describeContent
        describeContent = describeMatch[1];
      }

      // 扫描只有it或者test标签用例，无describe
      const singleItMatch = line.match(/^(it|test)\(['"](.*?)['"],/);
      if (singleItMatch) {
        const testcase = `${relativePath.replace(projPath, "")}?${singleItMatch[2]}`;
        testcases.push(testcase);
        describeContent = "";
        continue;
      }
      // 匹配describe下的 it 或 test 标签
      const itMatch = line.match(/\s+(it|test)\(['"](.*?)['"],/);
      if (itMatch) {
        if (describeContent) {
          const testcase = `${relativePath.replace(projPath, "")}?${describeContent} ${itMatch[2]}`;
          testcases.push(testcase);
        }
      }
    }
  }

  return Array.from(new Set(testcases));
};

/// 生成运行测试用例的命令
export function generateCommands(
  filePath: string,
  testCases: string[],
  jsonName: string
): string {

  // 从环境变量中获取 TESTSOLAR_TTP_EXTRAARGS 值
  const extraArgs = process.env.TESTSOLAR_TTP_EXTRAARGS || "";
  // 构建 Cypress 命令
  let command = `npx cypress run --spec "${filePath}" --reporter=mochawesome --reporter-options reportDir="",reportFilename="${jsonName}",json=true`;

  // 添加额外参数
  command += ` ${extraArgs}`;

  log.info(`Generated Cypress command: ${command}`);
  return command
}

export function parseSuiteLogs(message: string): Map<string, string> {
  const contentList = message.split("●");
  const data = new Map<string, string>();

  for (const content of contentList) {
    if (!content.trim()) {
      continue;
    }
    const case_name = content.split("\n")[0].replace(" › ", " ").trim();
    data.set(case_name, content);
  }

  return data;
}

// 解析 JSON 内容并返回用例结果
export function parseJsonContent(
  projPath: string,
  data: JsonData,
): Record<string, SpecResult> {
  const caseResults: Record<string, SpecResult> = {};

  // 扫描 Cypress 截图
  const screenshots = scanCypressScreenshots(process.cwd());
  console.log(`发现用例截图数量: ${Object.keys(screenshots).length}`);

  const videos = scanCypressVideos(process.cwd());
  console.log(`发现用例视频数量: ${Object.keys(videos).length}`);

  // 将字符串时间转换为 Unix 时间戳
  const startTime = new Date(data.stats.start).getTime();
  const endTime = new Date(data.stats.end).getTime();

  for (const testResult of data.results) {
    const fullFile = testResult.fullFile;
    const testPath = path.relative(projPath, fullFile);

    for (const suite of testResult.suites) {
      const description = suite.title;
      for (const test of suite.tests) {
        const testName = test.fullTitle;
        const testselector = `${testPath}?${testName}`;
        const result = test.state;
        if (result === "pending") {
          continue;
        }

        const failureMessages = test.err.estack || "";

        const specResult: SpecResult = {
          result: result,
          duration: test.duration,
          startTime: startTime,
          endTime: endTime,
          message: failureMessages,
          content: `${test.code}\n\n${failureMessages}`,
          description: description,
          attachments: [], // 默认为每个用例初始化空的attachments数组
        };

        // 只有测试失败时才添加截图
        if (result === "failed") {
          // 遍历截图字典，判断键是否包含在testselector中
          for (const screenshotKey in screenshots) {
            if (testselector.includes(screenshotKey)) {
              // 添加截图到attachments
              const attachment = new Attachment(
                "测试失败截图",
                screenshots[screenshotKey],
                AttachmentType.FILE,
              );
              
              specResult.attachments!.push(attachment);
              console.log(`为失败用例 ${testselector} 添加了截图: ${screenshots[screenshotKey]}`);
            }
          }

          // 遍历视频字典，判断键是否包含在testselector中
          for (const videoKey in videos) {
            if (testselector.includes(videoKey)) {
              // 添加视频到attachments
              const attachment = new Attachment(
                "测试失败视频",
                videos[videoKey],
                AttachmentType.FILE,
              );
              
              specResult.attachments!.push(attachment);
              console.log(`为失败用例 ${testselector} 添加了视频: ${videos[videoKey]}`);
            }
          }
        }

        if (!caseResults[testselector]) {
          caseResults[testselector] = specResult;
        } else {
          caseResults[testselector].message += "\n" + specResult.message;
          
          // 合并可能存在的attachments
          if (specResult.attachments && specResult.attachments.length > 0) {
            // 因为attachments现在总是被初始化，所以不需要检查是否为undefined
            caseResults[testselector].attachments!.push(...specResult.attachments);
          }
        }
      }
    }
  }
  return caseResults;
}

// 解析 JSON 文件并返回用例结果
export function parseJsonFile(
  projPath: string,
  jsonFile: string,
): Record<string, SpecResult> {
  const data = JSON.parse(fs.readFileSync(jsonFile, "utf-8"));
  log.info("--------json data:---------");
  log.info(JSON.stringify(data, null, 2));
  log.info("---------------------------");
  const result = parseJsonContent(projPath, data);
  log.info(`Parse result from json: ${JSON.stringify(result, null, 2)}`);
  return result;
}

export function createTempDirectory(): string {
  const prefix = "caseOutPut";
  const tempDirectory = path.join(os.homedir(), `${prefix}-${Date.now()}`);

  fs.mkdirSync(tempDirectory);
  log.info(`Temporary directory created: ${tempDirectory}`);
  return tempDirectory;
}

// 执行命令列表并上报结果，增加重试机制
const execAsync: (command: string) => Promise<{ stdout: string; stderr: string }> = promisify(exec);


export function groupTestCasesByPath(
  testcases: string[],
): Record<string, string[]> {
  const groupedTestCases: Record<string, string[]> = {};

  testcases.forEach((testcase) => {
    let path: string;
    let name: string = "";

    // 检查测试用例是否包含问号
    const questionMarkIndex = testcase.indexOf("?");
    if (questionMarkIndex !== -1) {
      // 如果有问号，分割路径和名称
      path = testcase.substring(0, questionMarkIndex);
      name = testcase.substring(questionMarkIndex + 1);
    } else {
      // 如果没有问号，路径是整个测试用例，名称为空字符串
      path = testcase;
    }

    // 如果路径不存在，则初始化一个空数组
    if (!groupedTestCases[path]) {
      groupedTestCases[path] = [];
    }

    // 将测试用例名称添加到对应路径的数组中
    groupedTestCases[path].push(name);
  });

  log.info("Grouped test cases by path: ", groupedTestCases);

  return groupedTestCases;
}

export function createTestResults(
  output: Record<string, SpecResult>,
): TestResult[] {
  const testResults: TestResult[] = [];

  for (const [testCase, result] of Object.entries(output)) {
    const test = new TestCase(testCase, {description: result.description || ""}); // 假设 TestCase 构造函数接受路径和空记录
    const startTime = new Date(result.startTime).toISOString();
    const endTime = new Date(result.endTime).toISOString();
    const resultType =
      result.result === "passed" ? ResultType.SUCCEED : ResultType.FAILED;
    const message = result.message || "";
    const content = result.content || "";
    const attachments = result.attachments || [];

    // 创建 TestCaseLog 实例
    const testLog = new TestCaseLog(
      startTime, // 使用结束时间作为日志时间
      result.result === "passed" ? LogLevel.INFO : LogLevel.ERROR,
      content,
      attachments,
      undefined, // 无断言错误
      undefined, // 无运行时错误
    );

    // 创建 TestCaseStep 实例
    const testStep = new TestCaseStep(
      startTime,
      endTime,
      "Step title",
      resultType,
      [testLog],
    );

    // 创建 TestResult 实例
    const testResult = new TestResult(
      test,
      startTime,
      endTime,
      resultType,
      message,
      [testStep],
    );

    // 添加到结果数组
    testResults.push(testResult);
  }

  return testResults;
}

// sleep 函数用于等待指定的时间（以毫秒为单位）
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function scanCypressScreenshots(projPath: string): Record<string, string> {
  const screenshotsDir = path.join(projPath, 'cypress', 'screenshots');
  const result: Record<string, string> = {};

  // 检查截图目录是否存在
  if (!fs.existsSync(screenshotsDir)) {
    console.warn(`Cypress screenshots directory not found: ${screenshotsDir}`);
    return result;
  }

  // 遍历截图目录
  const specDirs = fs.readdirSync(screenshotsDir);
  for (const specDir of specDirs) {
    const specDirPath = path.join(screenshotsDir, specDir);
    const screenshotFiles = fs.readdirSync(specDirPath);

    // 处理每个截图文件
    for (const file of screenshotFiles) {
      if (file.endsWith('.png')) {
        // 解析文件名中的 describe 和 it 信息
        const [describe, it] = file.replace(' (failed).png', '').split(' -- ');
        const key = `${specDir}?${describe} ${it}`;
        const fullPath = path.join(specDirPath, file);

        // 添加到结果字典
        result[key] = fullPath;
      }
    }
  }

  return result;
}



export function scanCypressVideos(projPath: string): Record<string, string> {
  const videosDir = path.join(projPath, 'cypress', 'videos');
  const result: Record<string, string> = {};

  // 检查视频目录是否存在
  if (!fs.existsSync(videosDir)) {
    console.warn(`Cypress videos directory not found: ${videosDir}`);
    return result;
  }

  // 遍历视频目录
  const specDirs = fs.readdirSync(videosDir);
  for (const specDir of specDirs) {
    const specDirPath = path.join(videosDir, specDir);
    const videoFiles = fs.readdirSync(specDirPath);
    
    // 处理每个视频文件
    for (const file of videoFiles) {
      if (file.endsWith('.mp4')) {
        // 解析文件名中的 describe 和 it 信息
        const key = file.replace('.mp4', '');
        const fullPath = path.join(specDirPath, file);

        // 添加到结果字典
        result[key] = fullPath;
      }
    }
  }

  return result;
}
