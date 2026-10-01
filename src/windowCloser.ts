import * as vscode from 'vscode';
import type { Logger } from './logger';

const CLOSE_WINDOW_COMMAND = 'workbench.action.closeWindow';

export class WindowCloser {
  private constructor(
    private readonly supported: boolean,
    private readonly logger: Logger,
  ) {}

  public static async create(logger: Logger): Promise<WindowCloser> {
    const commands = await vscode.commands.getCommands(true);
    const supported = commands.includes(CLOSE_WINDOW_COMMAND);

    if (!supported) {
      logger.warn(
        `command ${CLOSE_WINDOW_COMMAND} is unavailable; close action is disabled`,
      );
    }

    return new WindowCloser(supported, logger);
  }

  public canClose(): boolean {
    return this.supported;
  }

  public async close(): Promise<boolean> {
    if (!this.supported) {
      return false;
    }

    this.logger.info(`executing ${CLOSE_WINDOW_COMMAND}`);
    await vscode.commands.executeCommand(CLOSE_WINDOW_COMMAND);
    return true;
  }
}
