interface WorkspaceContributionModule {
  workspaceContributionOrder?: number;
  registerWorkspaceContribution?: () => void;
}

const modules = import.meta.glob<WorkspaceContributionModule>(['./*.{ts,tsx}', '!./index.ts'], {
  eager: true,
});

let builtinsRegistered = false;

export function registerBuiltinWorkspaceContributions(): void {
  if (builtinsRegistered) return;
  Object.values(modules)
    .sort((a, b) => (a.workspaceContributionOrder ?? 50) - (b.workspaceContributionOrder ?? 50))
    .forEach((module) => module.registerWorkspaceContribution?.());
  builtinsRegistered = true;
}
