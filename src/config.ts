import * as vscode from 'vscode';

export type CleanupAction = 'notify' | 'close';

export interface CleanerConfig {
  enabled: boolean;
  idleMs: number;
  idleHours: number;
  action: CleanupAction;
  checkIntervalMs: number;
  checkIntervalMinutes: number;
  protectDirtyEditors: boolean;
}

export function readConfig(): CleanerConfig {
  const config = vscode.workspace.getConfiguration('staleWindowCleaner');
  const idleHours = Math.max(0.01, config.get<number>('idleHours', 24));
  const checkIntervalMinutes = Math.max(
    1,
    config.get<number>('checkIntervalMinutes', 30),
  );
  const configuredAction = config.get<string>('action', 'close');

  return {
    enabled: config.get<boolean>('enabled', true),
    idleMs: idleHours * 60 * 60 * 1000,
    idleHours,
    action: configuredAction === 'close' ? 'close' : 'notify',
    checkIntervalMs: checkIntervalMinutes * 60 * 1000,
    checkIntervalMinutes,
    protectDirtyEditors: config.get<boolean>('protectDirtyEditors', false),
  };
}
