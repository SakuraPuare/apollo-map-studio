export {};

declare global {
  interface Window {
    __apolloE2eFilePickers: Array<{
      accept: string;
      clicked: boolean;
      multiple: boolean;
      type: string;
    }>;
    __apolloE2eDownloads: Array<{ download: string; href: string }>;
    __apolloE2eNativeActions: string[];
  }
}
