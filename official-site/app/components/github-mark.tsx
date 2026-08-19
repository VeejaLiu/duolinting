import Image from "next/image";

export function GitHubMark({ className }: { className?: string }) {
  return <Image className={className} src="/github-mark.svg" alt="" width={20} height={20} aria-hidden="true" />;
}
