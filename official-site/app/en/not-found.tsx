import Link from "next/link";

export default function EnglishNotFound() {
  return (
    <main className="not-found" lang="en">
      <div>
        <p className="eyebrow"><span></span>404</p>
        <h1>This page is not ready yet.</h1>
        <p>Return to the DuolinTing home page, or read the Android download guide.</p>
        <div>
          <Link className="button button-primary" href="/en">Back to home</Link>
          <Link className="button button-secondary" href="/en/download">View download</Link>
        </div>
      </div>
    </main>
  );
}
