import * as vscode from 'vscode';

export interface WorkspaceIdentity {
  key: string;
  label: string;
}

export function getWorkspaceIdentity(): WorkspaceIdentity | undefined {
  if (vscode.workspace.workspaceFile) {
    return {
      key: `workspace:${vscode.workspace.workspaceFile.toString()}`,
      label: vscode.workspace.workspaceFile.fsPath,
    };
  }

  const folders = vscode.workspace.workspaceFolders;
  if (!folders?.length) {
    return undefined;
  }

  return {
    key: `folders:${folders
      .map((folder) => folder.uri.toString())
      .sort()
      .join('|')}`,
    label: folders.map((folder) => folder.uri.fsPath).join(', '),
  };
}
