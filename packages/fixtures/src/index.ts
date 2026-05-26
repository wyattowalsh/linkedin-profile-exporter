export const denseProfileHtml = String.raw`<!doctype html>
<html lang="en">
  <head>
    <title>Alex Rivera | LinkedIn</title>
    <meta property="og:url" content="https://www.linkedin.com/in/alex-rivera-fixture/" />
    <meta property="og:image" content="https://static.example.test/alex-rivera.png" />
    <meta name="description" content="Engineering leader building privacy-preserving data products." />
  </head>
  <body>
    <main data-lpe-profile data-profile-url="https://www.linkedin.com/in/alex-rivera-fixture/">
      <section data-lpe-section="identity">
        <h1 data-field="name">Alex Rivera</h1>
        <p data-field="headline">Engineering leader building privacy-preserving data products</p>
        <p data-field="location">New York, NY</p>
        <p data-field="about">I build local-first tools that turn messy browser workflows into structured, reviewable data.</p>
        <a data-field="contact" href="https://alex.example.test">Portfolio</a>
      </section>
      <section data-lpe-section="work">
        <article data-lpe-item>
          <h2 data-field="title">Director of Engineering</h2>
          <p data-field="company">Northstar Labs</p>
          <p data-field="location">New York, NY</p>
          <p data-field="dates">2021 - Present</p>
          <p data-field="description">Led browser automation and data quality teams.</p>
          <article data-lpe-role>
            <span data-field="title">Engineering Manager</span>
            <span data-field="dates">2021 - 2022</span>
            <span data-field="description">Managed the initial local-export product team.</span>
          </article>
        </article>
      </section>
      <section data-lpe-section="education">
        <article data-lpe-item>
          <h2 data-field="school">Example University</h2>
          <p data-field="degree">BS</p>
          <p data-field="field">Computer Science</p>
          <p data-field="dates">2011 - 2015</p>
          <p data-field="activities">Research assistant, accessibility lab</p>
        </article>
      </section>
      <section data-lpe-section="skills">
        <span data-lpe-item>TypeScript</span>
        <span data-lpe-item>Browser Extensions</span>
        <span data-lpe-item>Data Modeling</span>
      </section>
      <section data-lpe-section="licenses-certifications">
        <article data-lpe-item>
          <h2 data-field="name">Privacy Engineering Certificate</h2>
          <p data-field="issuer">Example Standards Institute</p>
          <p data-field="date">2024</p>
        </article>
      </section>
      <section data-lpe-section="projects">
        <article data-lpe-item>
          <h2 data-field="name">Local Export Workbench</h2>
          <p data-field="description">A fixture-backed browser export QA tool.</p>
          <a data-field="url" href="https://example.test/workbench">Project link</a>
        </article>
      </section>
      <section data-lpe-section="publications">
        <article data-lpe-item>
          <h2 data-field="name">Practical Provenance for Browser Data</h2>
          <p data-field="publisher">Example Journal</p>
          <p data-field="date">2025</p>
        </article>
      </section>
      <section data-lpe-section="volunteering">
        <article data-lpe-item>
          <h2 data-field="role">Mentor</h2>
          <p data-field="organization">Local Tech Fellows</p>
          <p data-field="description">Mentored early-career engineers.</p>
        </article>
      </section>
      <section data-lpe-section="honors-awards">
        <article data-lpe-item>
          <h2 data-field="title">Data Quality Leadership Award</h2>
          <p data-field="issuer">Northstar Labs</p>
          <p data-field="date">2023</p>
        </article>
      </section>
      <section data-lpe-section="languages">
        <article data-lpe-item>
          <h2 data-field="language">English</h2>
          <p data-field="fluency">Native</p>
        </article>
      </section>
      <section data-lpe-section="courses">
        <article data-lpe-item>
          <h2 data-field="name">Accessible Automation Systems</h2>
          <p data-field="provider">Example Learning</p>
        </article>
      </section>
      <section data-lpe-section="recommendations">
        <article data-lpe-item>
          <h2 data-field="name">Morgan Lee</h2>
          <p data-field="relationship">Former manager</p>
          <p data-field="text">Alex consistently made ambiguous data problems tractable.</p>
        </article>
      </section>
      <section data-lpe-section="featured">
        <article data-lpe-item>
          <h2 data-field="title">Privacy-first extension demo</h2>
          <a data-field="url" href="https://example.test/demo">Demo</a>
        </article>
      </section>
      <section data-lpe-section="organizations">
        <article data-lpe-item>
          <h2 data-field="name">Browser Tools Guild</h2>
          <p data-field="role">Member</p>
        </article>
      </section>
      <section data-lpe-section="interests">
        <span data-lpe-item>Local-first software</span>
        <span data-lpe-item>Knowledge tools</span>
      </section>
      <button data-lpe-show-more>Show more</button>
      <script type="application/json" data-linkedin-profile-state>
        {
          "metadata": { "locale": "en-US" },
          "identity": { "headline": "Engineering leader building privacy-preserving data products" },
          "skills": [{ "name": "Schema Design", "endorsements": 8 }]
        }
      </script>
    </main>
  </body>
</html>`;

export const sparseProfileHtml = String.raw`<!doctype html>
<html>
  <head>
    <meta property="og:url" content="https://www.linkedin.com/in/sam-sparse-fixture/" />
  </head>
  <body>
    <main data-lpe-profile data-profile-url="https://www.linkedin.com/in/sam-sparse-fixture/">
      <section data-lpe-section="identity">
        <h1 data-field="name">Sam Sparse</h1>
        <p data-field="headline">Independent consultant</p>
      </section>
    </main>
  </body>
</html>`;

export const liveLikeProfileHtml = String.raw`<!doctype html>
<html lang="en">
  <head>
    <meta property="og:url" content="https://www.linkedin.com/in/jordan-live-like/" />
    <meta name="description" content="Product operator building local export workflows." />
  </head>
  <body>
    <div class="scaffold-layout">
      <div role="main" class="scaffold-layout__main">
        <section class="pv-top-card ph5">
          <div class="text-heading-xlarge">Jordan Lee</div>
          <div class="text-body-medium break-words">Product operator building local export workflows</div>
          <span class="text-body-small inline t-black--light break-words">Brooklyn, NY</span>
        </section>
      </div>
    </div>
  </body>
</html>`;

export const voyagerProfilePayload = {
  data: {
    "*profile": "urn:li:fs_profile:alex-rivera",
    "*positionView": ["urn:li:fs_position:(alex-rivera,1)"],
    "*educationView": ["urn:li:fs_education:(alex-rivera,1)"],
    "*skillView": ["urn:li:fs_skill:(alex-rivera,typescript)"],
    "*certificationView": ["urn:li:fs_certification:(alex-rivera,privacy)"],
    "*projectView": ["urn:li:fs_project:(alex-rivera,workbench)"],
    "*volunteerExperienceView": ["urn:li:fs_volunteer:(alex-rivera,mentor)"],
    "*honorView": ["urn:li:fs_honor:(alex-rivera,award)"],
    "*publicationView": ["urn:li:fs_publication:(alex-rivera,provenance)"],
    "*languageView": ["urn:li:fs_language:(alex-rivera,en)"]
  },
  included: [
    {
      entityUrn: "urn:li:fs_profile:alex-rivera",
      $type: "com.linkedin.voyager.identity.profile.Profile",
      firstName: "Alex",
      lastName: "Rivera",
      headline: "Engineering leader building privacy-preserving data products",
      summary: "I build local-first tools that turn messy browser workflows into structured, reviewable data.",
      locationName: "New York, NY",
      publicIdentifier: "alex-rivera-fixture",
      defaultLocale: { language: "en", country: "US" }
    },
    {
      entityUrn: "urn:li:fs_position:(alex-rivera,1)",
      $type: "com.linkedin.voyager.identity.profile.Position",
      title: "Director of Engineering",
      companyName: "Northstar Labs",
      locationName: "New York, NY",
      description: "Led browser automation and data quality teams.",
      timePeriod: { startDate: { year: 2021, month: 1 } }
    },
    {
      entityUrn: "urn:li:fs_education:(alex-rivera,1)",
      $type: "com.linkedin.voyager.identity.profile.Education",
      schoolName: "Example University",
      degreeName: "BS",
      fieldOfStudy: "Computer Science",
      timePeriod: { startDate: { year: 2011 }, endDate: { year: 2015 } },
      activities: "Research assistant, accessibility lab"
    },
    {
      entityUrn: "urn:li:fs_skill:(alex-rivera,typescript)",
      $type: "com.linkedin.voyager.identity.profile.Skill",
      name: "TypeScript"
    },
    {
      entityUrn: "urn:li:fs_certification:(alex-rivera,privacy)",
      $type: "com.linkedin.voyager.dash.identity.profile.Certification",
      name: "Privacy Engineering Certificate",
      authority: "Example Standards Institute",
      timePeriod: { startDate: { year: 2024 } }
    },
    {
      entityUrn: "urn:li:fs_project:(alex-rivera,workbench)",
      $type: "com.linkedin.voyager.identity.profile.Project",
      title: "Local Export Workbench",
      description: "A fixture-backed browser export QA tool.",
      url: "https://example.test/workbench"
    },
    {
      entityUrn: "urn:li:fs_volunteer:(alex-rivera,mentor)",
      $type: "com.linkedin.voyager.dash.identity.profile.VolunteerExperience",
      role: "Mentor",
      companyName: "Local Tech Fellows",
      description: "Mentored early-career engineers."
    },
    {
      entityUrn: "urn:li:fs_honor:(alex-rivera,award)",
      $type: "com.linkedin.voyager.identity.profile.Honor",
      title: "Data Quality Leadership Award",
      issuer: "Northstar Labs",
      issueDate: { year: 2023 }
    },
    {
      entityUrn: "urn:li:fs_publication:(alex-rivera,provenance)",
      $type: "com.linkedin.voyager.identity.profile.Publication",
      name: "Practical Provenance for Browser Data",
      publisher: "Example Journal",
      date: { year: 2025 }
    },
    {
      entityUrn: "urn:li:fs_language:(alex-rivera,en)",
      $type: "com.linkedin.voyager.identity.profile.Language",
      name: "English",
      proficiency: "NATIVE_OR_BILINGUAL"
    }
  ]
} as const;

export const voyagerSupplementalSkillsPayload = {
  data: {
    "*elements": ["urn:li:fs_skill:(alex-rivera,browser-extensions)"]
  },
  included: [
    {
      entityUrn: "urn:li:fs_skill:(alex-rivera,browser-extensions)",
      $type: "com.linkedin.voyager.identity.profile.Skill",
      name: "Browser Extensions"
    }
  ]
} as const;

export const metadataBackedProfileHtml = String.raw`<!doctype html>
<html lang="en">
  <head>
    <title>Taylor Morgan - Privacy engineer | LinkedIn</title>
    <meta property="og:url" content="https://www.linkedin.com/in/taylor-metadata/" />
    <meta property="og:title" content="Taylor Morgan - Privacy engineer | LinkedIn" />
    <meta name="description" content="Privacy engineer building local-first export tools." />
  </head>
  <body>
    <main class="scaffold-layout__main"></main>
  </body>
</html>`;

export const multilingualProfileHtml = String.raw`<!doctype html>
<html lang="es">
  <head>
    <meta property="og:url" content="https://www.linkedin.com/in/ana-multilingual-fixture/" />
  </head>
  <body>
    <main data-lpe-profile data-profile-url="https://www.linkedin.com/in/ana-multilingual-fixture/">
      <section data-lpe-section="identity">
        <h1 data-field="name">Ana Martinez</h1>
        <p data-field="headline">Arquitecta de datos</p>
        <p data-field="location">Madrid, Spain</p>
        <p data-field="about">Disena sistemas de datos accesibles y auditables.</p>
      </section>
      <section data-lpe-section="languages">
        <article data-lpe-item>
          <h2 data-field="language">Spanish</h2>
          <p data-field="fluency">Native</p>
        </article>
        <article data-lpe-item>
          <h2 data-field="language">English</h2>
          <p data-field="fluency">Professional</p>
        </article>
      </section>
    </main>
  </body>
</html>`;

export const hiddenSectionProfileHtml = denseProfileHtml.replace(
  '<section data-lpe-section="projects">',
  '<section data-lpe-section="projects" data-lpe-hidden="true">'
);

export const invalidProfileFixture = {
  schemaVersion: "linkedin-profile-exporter.profile.v1",
  identity: {
    profileUrl: "not-a-url"
  }
};
