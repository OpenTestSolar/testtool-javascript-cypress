import * as fs from "fs";

import {
  executeCommand,
  generateCommands,
  groupTestCasesByPath,
  createTestResults,
  parseJsonFile,
} from "./utils";
import log from 'testsolar-oss-sdk/src/testsolar_sdk/logger';
import Reporter from "testsolar-oss-sdk/src/testsolar_sdk/reporter";

export async function runTestCase(runParamFile: string): Promise<void> {
  try {
    log.info("Pipe file: ", runParamFile);
    const fileContent = fs.readFileSync(runParamFile, "utf-8");
    const data = JSON.parse(fileContent);
    log.info(`Pipe file content:\n${JSON.stringify(data, null, 2)}`);
    const testSelectors = data.TestSelectors || [];
    const projPath = data.ProjectPath;
    const taskId = data.TaskId;

    // 按照文件对用例进行分组
    const caseLists = groupTestCasesByPath(testSelectors);

    // 对每个文件生成命令行
    for (const [path, testcases] of Object.entries(caseLists)) {
      // 生成 json 文件名称
      const jsonName = path.replace(/\//g, "_") + ".json";

      const command = generateCommands(path, testcases, jsonName);
      
      // 执行命令，解析用例生成的 JSON 文件，上报结果
      const { success } = await executeCommand(command);

      if (!success) {
        log.warn(`Command execution failed for ${path}. Check logs for details.`);
        // 可以在这里添加额外的错误处理逻辑
      }

      // 检查文件是否存在
      if (fs.existsSync(jsonName)) {
        const testResults = parseJsonFile(projPath, jsonName);
        log.info("Parse json results:\n", testResults);
        const results = createTestResults(testResults);

        const reporter = new Reporter(taskId, data.FileReportPath);
        for (const result of results) {
          await reporter.reportTestResult(result);
        }
      } else {
        log.error(`Result file ${jsonName} not found after command execution.`);
      }
    }
  } catch (error) {
    log.error("An unexpected error occurred:", error);
    // 如果需要，可以在这里添加更多的错误处理逻辑
  }
}