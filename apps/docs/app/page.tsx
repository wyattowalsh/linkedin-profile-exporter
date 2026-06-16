import {
  ArrowRight,
  BadgeCheck,
  Binary,
  Boxes,
  Download,
  FileJson,
  LockKeyhole,
  ShieldCheck
} from "lucide-react";
import { Alert } from "../components/ui/alert";
import { Badge } from "../components/ui/badge";
import { ButtonLink } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Separator } from "../components/ui/separator";

const quickLinks = [
  {
    href: "/docs/install",
    label: "Install",
    description: "Build browser artifacts and load them locally.",
    icon: Download
  },
  {
    href: "/docs/usage",
    label: "Use",
    description: "Extract, review, and deliver local exports.",
    icon: BadgeCheck
  },
  {
    href: "/docs/export-formats",
    label: "Exports",
    description: "Compare schema sections and output formats.",
    icon: FileJson
  },
  {
    href: "/docs/settings-privacy",
    label: "Privacy",
    description: "Understand clean defaults and opt-in diagnostics.",
    icon: LockKeyhole
  }
];

const modelSections = [
  "Identity",
  "Experience",
  "Education",
  "Skills",
  "Certifications",
  "Projects",
  "Publications",
  "Volunteering",
  "Honors",
  "Tests",
  "Courses",
  "Featured"
];

export default function Page() {
  return (
    <main className="docs-home-shell">
      <div className="docs-home-inner flex flex-col gap-10">
        <header className="flex items-center justify-between gap-4">
          <a className="flex items-center gap-3 no-underline" href="/docs" aria-label="Docs home">
            <img
              className="docs-home-mark rounded-lg shadow-sm"
              src="/icon/linkedin-profile-exporter-icon.png"
              alt=""
              aria-hidden="true"
              width="72"
              height="72"
            />
            <div className="hidden min-w-0 sm:block">
              <p className="text-sm font-semibold text-zinc-950">LinkedIn Profile Exporter</p>
              <p className="text-xs text-zinc-600">Local profile data tools</p>
            </div>
          </a>
          <nav className="flex items-center gap-2" aria-label="Primary">
            <ButtonLink href="/docs" variant="secondary">
              Read docs
              <ArrowRight data-icon="inline-end" />
            </ButtonLink>
          </nav>
        </header>

        <section className="grid gap-8 lg:grid-cols-[1.35fr_0.85fr] lg:items-end">
          <div className="flex flex-col gap-6">
            <Badge variant="outline" className="w-fit">
              Contract-first browser export
            </Badge>
            <div className="max-w-3xl">
              <p className="docs-kicker">v0.1.0 documentation</p>
              <h1 className="mt-3 text-balance text-4xl font-semibold leading-tight text-zinc-950 md:text-6xl">
                Capture LinkedIn profile structure without shipping profile data anywhere.
              </h1>
              <p className="mt-5 max-w-2xl text-pretty text-base leading-8 text-zinc-600">
                The extension and bookmarklet extract accessible page data, validate it against the
                canonical schema, and export local files for review, data portability, and LLM-ready
                context.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <ButtonLink href="/docs/install">
                Install locally
                <ArrowRight data-icon="inline-end" />
              </ButtonLink>
              <ButtonLink href="/docs/export-formats" variant="secondary">
                View data model
              </ButtonLink>
            </div>
          </div>

          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle>Export posture</CardTitle>
              <CardDescription>
                Defaults are clean and local. Rich diagnostics are opt-in when you need them.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3">
                <Metric label="Formats" value="7" />
                <Metric label="Profile sections" value="16" />
                <Metric label="Remote upload" value="0" />
                <Metric label="Analytics" value="0" />
              </div>
              <Separator />
              <div className="flex flex-wrap gap-2">
                {["JSON", "Resume", "YAML", "CSV", "XLSX", "XML", "Markdown"].map((format) => (
                  <Badge key={format} variant="secondary">
                    {format}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {quickLinks.map((item) => (
            <a
              key={item.href}
              className="group rounded-lg border border-zinc-200 bg-white p-4 text-zinc-950 no-underline shadow-sm transition-colors hover:bg-zinc-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-800"
              href={item.href}
            >
              <item.icon aria-hidden="true" />
              <p className="mt-4 text-sm font-semibold">{item.label}</p>
              <p className="mt-1 text-sm leading-6 text-zinc-600">{item.description}</p>
            </a>
          ))}
        </section>

        <section className="grid gap-6 lg:grid-cols-[0.7fr_1.3fr]">
          <div>
            <p className="docs-kicker">Canonical model</p>
            <h2 className="mt-3 text-balance text-2xl font-semibold text-zinc-950 md:text-3xl">
              LinkedIn-specific fields stay canonical instead of being squeezed into resume-only
              shapes.
            </h2>
          </div>
          <Card>
            <CardContent className="pt-5">
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {modelSections.map((section) => (
                  <div
                    key={section}
                    className="flex min-h-11 items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-3 text-sm text-zinc-700"
                  >
                    <Binary aria-hidden="true" />
                    <span>{section}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>

        <Alert className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <span>
            Provenance, confidence, and Voyager inventory diagnostics stay out of default exports.
            Enable Include all fields only when auditing extraction coverage.
          </span>
          <a className="font-medium" href="/docs/settings-privacy">
            Review settings
          </a>
        </Alert>

        <section className="grid gap-4 md:grid-cols-3">
          <InfoCard
            icon={Boxes}
            title="Browser packages"
            body="Chrome, Edge, Firefox, and Safari builds are generated from WXT target outputs."
            href="/docs/browser-targets"
          />
          <InfoCard
            icon={ShieldCheck}
            title="Validation gate"
            body="OpenSpec, lint, typecheck, tests, docs, assets, manifests, and E2E form the release gate."
            href="/docs/release"
          />
          <InfoCard
            icon={FileJson}
            title="Fixture-first tests"
            body="CI uses deterministic local pages and profile fixtures, never live LinkedIn credentials."
            href="/docs/development"
          />
        </section>
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
      <p className="text-2xl font-semibold tabular-nums text-zinc-950">{value}</p>
      <p className="mt-1 text-xs text-zinc-600">{label}</p>
    </div>
  );
}

function InfoCard({
  body,
  href,
  icon: Icon,
  title
}: {
  body: string;
  href: string;
  icon: typeof Boxes;
  title: string;
}) {
  return (
    <Card>
      <CardHeader>
        <Icon aria-hidden="true" />
        <CardTitle>{title}</CardTitle>
        <CardDescription>{body}</CardDescription>
      </CardHeader>
      <CardContent>
        <a className="text-sm font-medium" href={href}>
          Open section
        </a>
      </CardContent>
    </Card>
  );
}
