import { describe, expect, it } from "vitest";
import {
  denseProfileHtml,
  voyagerDashProfilePayload,
  voyagerProfilePayload
} from "@linkedin-profile-exporter/fixtures";
import {
  applyProfileSettings,
  extractProfileFromHtml,
  extractProfileFromVoyagerPayload
} from "../src";
import {
  careerBreakFromEntity,
  certificationDates,
  contactFromEntity,
  interestKindFromUrl,
  recommendationDirection
} from "../src/profile-document-fields";

const fixedNow = "2026-05-25T12:00:00.000Z";

type IncludedPayload = {
  included: Array<Record<string, unknown>>;
};

function cloneClassicPayload(): IncludedPayload {
  return structuredClone(voyagerProfilePayload) as unknown as IncludedPayload;
}

function profileEntity(payload: IncludedPayload): Record<string, unknown> {
  const entity = payload.included.find(
    (item) => item.$type === "com.linkedin.voyager.identity.profile.Profile"
  );
  if (!entity) throw new Error("Classic fixture is missing a Profile entity.");
  return entity;
}

describe("profile document field helpers", () => {
  it("derives interest kind from LinkedIn URL paths and omits unknown hosts", () => {
    expect(interestKindFromUrl("https://www.linkedin.com/company/local-first/")).toBe("company");
    expect(interestKindFromUrl("https://www.linkedin.com/groups/12345/")).toBe("group");
    expect(interestKindFromUrl("https://www.linkedin.com/newsletter/weekly/")).toBe("newsletter");
    expect(interestKindFromUrl("https://www.linkedin.com/newsletters/weekly/")).toBe("newsletter");
    expect(interestKindFromUrl("https://www.linkedin.com/school/example-university/")).toBe(
      "school"
    );
    expect(interestKindFromUrl("https://www.linkedin.com/in/alex-rivera-fixture/")).toBe(
      "topVoice"
    );
    expect(interestKindFromUrl("https://example.test/local-first")).toBeUndefined();
    expect(interestKindFromUrl("https://example.test/company/foo")).toBeUndefined();
    expect(interestKindFromUrl("https://www.linkedin.com/feed/")).toBeUndefined();
  });

  it("filters Present and same-string certification dates", () => {
    expect(certificationDates("2024", "2026")).toEqual({ date: "2024", expirationDate: "2026" });
    expect(certificationDates("2024", "2024")).toEqual({ date: "2024" });
    expect(certificationDates("2024")).toEqual({ date: "2024" });
    expect(certificationDates(undefined, "2026")).toEqual({ date: "2026" });
    expect(certificationDates("2024", "Present")).toEqual({ date: "2024" });
    expect(certificationDates("Present", "2026")).toEqual({ date: "2026" });
    expect(certificationDates("Present", "Present")).toEqual({});
  });

  it("maps IM account names, month-day birthdays, and recipe career breaks", () => {
    expect(
      contactFromEntity({
        ims: [{ provider: "SKYPE", imAccountName: "alex.rivera" }],
        birthDateOn: { month: 5, day: 25 }
      })
    ).toEqual({ im: "alex.rivera", birthday: "05-25" });
    expect(contactFromEntity({ ims: [{ provider: "SKYPE", id: "alex.skype" }] })).toEqual({
      im: "alex.skype"
    });
    expect(contactFromEntity({ ims: [{ id: "urn:li:member:123" }] })).toBeUndefined();
    expect(careerBreakFromEntity({ $recipeType: "com.linkedin.voyager.dash.CareerBreak" })).toBe(
      "Career break"
    );
    expect(
      careerBreakFromEntity({
        $recipeTypes: ["com.linkedin.voyager.dash.deco.identity.profile.CareerBreakPosition"]
      })
    ).toBe("Career break");
    expect(careerBreakFromEntity({ title: "Director of Engineering" })).toBeUndefined();
    expect(recommendationDirection({ "*recommender": "urn:li:fs_miniProfile:jordan" })).toBe(
      "received"
    );
    expect(recommendationDirection({})).toBeUndefined();
  });
});

describe("omitted additive profile fields", () => {
  it("omits contact, openTo, causes, direction, kind, expirationDate, and careerBreak when absent", () => {
    const htmlProfile = extractProfileFromHtml(denseProfileHtml, { now: fixedNow });
    const voyagerProfile = extractProfileFromVoyagerPayload(voyagerProfilePayload, {
      now: fixedNow,
      url: "https://www.linkedin.com/in/alex-rivera-fixture/"
    });

    for (const profile of [htmlProfile, voyagerProfile]) {
      expect(profile.identity).not.toHaveProperty("contact");
      expect(profile.identity).not.toHaveProperty("openTo");
      expect(profile.identity).not.toHaveProperty("causes");
      expect(profile.work.every((item) => !("careerBreak" in item))).toBe(true);
      expect(profile.licensesCertifications.every((item) => !("expirationDate" in item))).toBe(
        true
      );
      expect(profile.recommendations.every((item) => !("direction" in item))).toBe(true);
    }

    expect(htmlProfile.interests[0]).toMatchObject({ url: "https://example.test/local-first" });
    expect(htmlProfile.interests[0]).not.toHaveProperty("kind");
    expect(voyagerProfile.licensesCertifications[0]?.date).toBe("2024");
    expect(htmlProfile.identity.links.some((link) => link.url.includes("alex.example.test"))).toBe(
      true
    );
  });
});

describe("populated additive profile fields", () => {
  it("keeps given and received recommendations with distinct direction values", () => {
    const payload = cloneClassicPayload();
    payload.included.push(
      {
        entityUrn: "urn:li:fs_miniProfile:sam-given",
        $type: "com.linkedin.voyager.identity.shared.MiniProfile",
        firstName: "Sam",
        lastName: "Given"
      },
      {
        entityUrn: "urn:li:fs_miniProfile:jordan-received",
        $type: "com.linkedin.voyager.identity.shared.MiniProfile",
        firstName: "Jordan",
        lastName: "Received"
      },
      {
        entityUrn: "urn:li:fs_recommendation:(alex-rivera,given-1)",
        $type: "com.linkedin.voyager.identity.profile.Recommendation",
        recommendationType: "GIVEN",
        "*recommendee": "urn:li:fs_miniProfile:sam-given",
        recommendationText: "Sam is an outstanding collaborator.",
        recommendationContext: "Managed Sam"
      },
      {
        entityUrn: "urn:li:fs_recommendation:(alex-rivera,received-1)",
        $type: "com.linkedin.voyager.identity.profile.Recommendation",
        recommendationType: "RECEIVED",
        "*recommender": "urn:li:fs_miniProfile:jordan-received",
        recommendationText: "Alex delivers reliable local-first exports.",
        recommendationContext: "Reported to Jordan"
      },
      {
        entityUrn: "urn:li:fs_recommendation:(alex-rivera,ambiguous-1)",
        $type: "com.linkedin.voyager.identity.profile.Recommendation",
        "*recommender": "urn:li:fs_miniProfile:jordan-received",
        "*recommendee": "urn:li:fs_miniProfile:sam-given",
        recommendationText: "Direction should stay omitted for ambiguous sides.",
        recommendationContext: "Colleague"
      },
      {
        entityUrn: "urn:li:fs_recommendation:(alex-rivera,neither-1)",
        $type: "com.linkedin.voyager.identity.profile.Recommendation",
        recommendationText: "Direction should stay omitted when neither side is present.",
        recommendationContext: "Colleague"
      }
    );

    const profile = extractProfileFromVoyagerPayload(payload, {
      now: fixedNow,
      url: "https://www.linkedin.com/in/alex-rivera-fixture/"
    });
    const given = profile.recommendations.find((item) => item.direction === "given");
    const received = profile.recommendations.find((item) => item.direction === "received");
    const ambiguous = profile.recommendations.find((item) => item.text.includes("ambiguous sides"));
    const neither = profile.recommendations.find((item) => item.text.includes("neither side"));

    expect(given).toMatchObject({ name: "Sam Given", direction: "given" });
    expect(received).toMatchObject({ name: "Jordan Received", direction: "received" });
    expect(ambiguous).toBeDefined();
    expect(ambiguous).not.toHaveProperty("direction");
    expect(neither).toBeDefined();
    expect(neither).not.toHaveProperty("direction");
  });

  it("sets company interest kind from the Dash company URL", () => {
    const profile = extractProfileFromVoyagerPayload(voyagerDashProfilePayload, {
      now: fixedNow,
      url: "https://www.linkedin.com/in/alex-rivera-fixture/"
    });
    expect(profile.interests[0]).toMatchObject({
      kind: "company",
      url: "https://www.linkedin.com/company/local-first/"
    });
  });

  it("keeps start-only certification dates and maps a distinct expirationDate", () => {
    const startOnly = extractProfileFromVoyagerPayload(voyagerProfilePayload, {
      now: fixedNow,
      url: "https://www.linkedin.com/in/alex-rivera-fixture/"
    });
    expect(startOnly.licensesCertifications[0]?.date).toBe("2024");
    expect(startOnly.licensesCertifications[0]).not.toHaveProperty("expirationDate");

    const payload = cloneClassicPayload();
    const certification = payload.included.find(
      (item) => item.$type === "com.linkedin.voyager.dash.identity.profile.Certification"
    );
    if (!certification) throw new Error("Classic fixture is missing a Certification entity.");
    certification.endDateOn = { year: 2026 };

    const withExpiration = extractProfileFromVoyagerPayload(payload, {
      now: fixedNow,
      url: "https://www.linkedin.com/in/alex-rivera-fixture/"
    });
    expect(withExpiration.licensesCertifications[0]).toMatchObject({
      date: "2024",
      expirationDate: "2026"
    });
    expect(withExpiration.licensesCertifications[0]?.date).not.toMatch(/Present|-/);

    const sameYear = cloneClassicPayload();
    const sameYearCert = sameYear.included.find(
      (item) => item.$type === "com.linkedin.voyager.dash.identity.profile.Certification"
    );
    if (!sameYearCert) throw new Error("Classic fixture is missing a Certification entity.");
    sameYearCert.endDateOn = { year: 2024 };
    const sameYearProfile = extractProfileFromVoyagerPayload(sameYear, {
      now: fixedNow,
      url: "https://www.linkedin.com/in/alex-rivera-fixture/"
    });
    expect(sameYearProfile.licensesCertifications[0]?.date).toBe("2024");
    expect(sameYearProfile.licensesCertifications[0]).not.toHaveProperty("expirationDate");

    const presentEnd = cloneClassicPayload();
    const presentCert = presentEnd.included.find(
      (item) => item.$type === "com.linkedin.voyager.dash.identity.profile.Certification"
    );
    if (!presentCert) throw new Error("Classic fixture is missing a Certification entity.");
    presentCert.expirationDate = "Present";
    const presentProfile = extractProfileFromVoyagerPayload(presentEnd, {
      now: fixedNow,
      url: "https://www.linkedin.com/in/alex-rivera-fixture/"
    });
    expect(presentProfile.licensesCertifications[0]?.date).toBe("2024");
    expect(presentProfile.licensesCertifications[0]).not.toHaveProperty("expirationDate");
    expect(presentProfile.licensesCertifications[0]?.date).not.toMatch(/Present/i);
  });

  it("omits careerBreak on ordinary work and maps a marked career-break role", () => {
    const ordinary = extractProfileFromVoyagerPayload(voyagerProfilePayload, {
      now: fixedNow,
      url: "https://www.linkedin.com/in/alex-rivera-fixture/"
    });
    expect(ordinary.work.every((item) => !("careerBreak" in item))).toBe(true);

    const payload = cloneClassicPayload();
    payload.included.push({
      entityUrn: "urn:li:fs_position:(alex-rivera,career-break)",
      $type: "com.linkedin.voyager.identity.profile.Position",
      title: "Parental leave",
      companyName: "Career break",
      careerBreak: "Parental leave",
      timePeriod: { startDate: { year: 2020 }, endDate: { year: 2021 } }
    });
    const profile = extractProfileFromVoyagerPayload(payload, {
      now: fixedNow,
      url: "https://www.linkedin.com/in/alex-rivera-fixture/"
    });
    expect(profile.work.some((item) => item.careerBreak === "Parental leave")).toBe(true);
    expect(
      profile.work.find((item) => item.title === "Director of Engineering")
    ).not.toHaveProperty("careerBreak");

    const recipePayload = cloneClassicPayload();
    recipePayload.included.push({
      entityUrn: "urn:li:fs_position:(alex-rivera,recipe-break)",
      $type: "com.linkedin.voyager.identity.profile.Position",
      title: "Sabbatical",
      $recipeType: "com.linkedin.voyager.dash.deco.identity.profile.CareerBreakPosition",
      timePeriod: { startDate: { year: 2019 }, endDate: { year: 2020 } }
    });
    const recipeProfile = extractProfileFromVoyagerPayload(recipePayload, {
      now: fixedNow,
      url: "https://www.linkedin.com/in/alex-rivera-fixture/"
    });
    expect(recipeProfile.work.some((item) => item.careerBreak === "Career break")).toBe(true);
    expect(
      recipeProfile.work.find((item) => item.title === "Director of Engineering")
    ).not.toHaveProperty("careerBreak");
  });

  it("maps Voyager contact, openTo, and causes without treating a DOM contact link as contact", () => {
    const payload = cloneClassicPayload();
    const identity = profileEntity(payload);
    identity.address = "Should stay in location";
    identity.contactInfo = {
      emailAddress: "alex@example.test",
      address: "123 Overlay St",
      ims: [{ provider: "SKYPE", imAccountName: "alex.rivera" }],
      birthDateOn: { month: 5, day: 25 }
    };
    identity.openToWork = true;
    identity.volunteerCauses = ["Climate"];

    const voyagerProfile = extractProfileFromVoyagerPayload(payload, {
      now: fixedNow,
      url: "https://www.linkedin.com/in/alex-rivera-fixture/"
    });
    expect(voyagerProfile.identity.contact).toEqual({
      email: "alex@example.test",
      im: "alex.rivera",
      birthday: "05-25",
      address: "123 Overlay St"
    });
    expect(voyagerProfile.identity.location).not.toBe("123 Overlay St");
    expect(voyagerProfile.identity.openTo).toEqual(["Open to work"]);
    expect(voyagerProfile.identity.causes).toEqual(["Climate"]);
    expect(voyagerProfile.volunteering[0]?.cause).toBe("Education");

    const htmlProfile = extractProfileFromHtml(denseProfileHtml, { now: fixedNow });
    expect(htmlProfile.identity).not.toHaveProperty("contact");
    expect(htmlProfile.volunteering[0]?.cause).toBe("Education");
  });

  it("maps structured DOM additive fields", () => {
    const html = `<!doctype html>
<html>
  <body>
    <main data-lpe-profile data-profile-url="https://www.linkedin.com/in/alex-rivera-fixture/">
      <section data-lpe-section="identity">
        <h1 data-field="name">Alex Rivera</h1>
        <p data-field="email">alex@example.test</p>
        <p data-field="openTo">Hiring</p>
        <p data-field="causes">Education</p>
        <a data-field="contact" href="https://alex.example.test">Portfolio</a>
      </section>
      <section data-lpe-section="work">
        <article data-lpe-item>
          <h2 data-field="title">Parental leave</h2>
          <p data-field="careerBreak">Parental leave</p>
        </article>
      </section>
      <section data-lpe-section="licenses-certifications">
        <article data-lpe-item>
          <h2 data-field="name">Privacy Engineering Certificate</h2>
          <p data-field="date">2024</p>
          <p data-field="expirationDate">2026</p>
        </article>
        <article data-lpe-item>
          <h2 data-field="name">Same-year Certificate</h2>
          <p data-field="date">2024</p>
          <p data-field="expirationDate">2024</p>
        </article>
        <article data-lpe-item>
          <h2 data-field="name">Present Certificate</h2>
          <p data-field="date">2024</p>
          <p data-field="expirationDate">Present</p>
        </article>
      </section>
      <section data-lpe-section="recommendations">
        <article data-lpe-item>
          <h2 data-field="name">Sam Given</h2>
          <p data-field="text">Sam is an outstanding collaborator.</p>
          <p data-field="direction">given</p>
        </article>
      </section>
      <section data-lpe-section="interests">
        <article data-lpe-item>
          <span data-field="name">Local-first software</span>
          <a data-field="url" href="https://www.linkedin.com/company/local-first/">Local-first</a>
        </article>
      </section>
    </main>
  </body>
</html>`;
    const profile = extractProfileFromHtml(html, { now: fixedNow });
    expect(profile.identity.contact).toEqual({ email: "alex@example.test" });
    expect(profile.identity.openTo).toEqual(["Hiring"]);
    expect(profile.identity.causes).toEqual(["Education"]);
    expect(profile.work[0]?.careerBreak).toBe("Parental leave");
    expect(profile.licensesCertifications[0]).toMatchObject({
      date: "2024",
      expirationDate: "2026"
    });
    expect(profile.licensesCertifications[1]?.date).toBe("2024");
    expect(profile.licensesCertifications[1]).not.toHaveProperty("expirationDate");
    expect(profile.licensesCertifications[2]?.date).toBe("2024");
    expect(profile.licensesCertifications[2]).not.toHaveProperty("expirationDate");
    expect(profile.licensesCertifications[2]?.date).not.toMatch(/Present/i);
    expect(profile.recommendations[0]?.direction).toBe("given");
    expect(profile.interests[0]?.kind).toBe("company");
  });

  it("drops contact, openTo, and causes when identity is out of data scope", () => {
    const payload = cloneClassicPayload();
    const identity = profileEntity(payload);
    identity.contactInfo = { emailAddress: "alex@example.test" };
    identity.openTo = ["Hiring"];
    identity.causes = ["Education"];
    const profile = extractProfileFromVoyagerPayload(payload, {
      now: fixedNow,
      url: "https://www.linkedin.com/in/alex-rivera-fixture/"
    });
    expect(profile.identity.contact).toEqual({ email: "alex@example.test" });
    expect(profile.identity.openTo).toEqual(["Hiring"]);
    expect(profile.identity.causes).toEqual(["Education"]);
    const filtered = applyProfileSettings(profile, { dataScope: { identity: false } });
    expect(filtered.identity).not.toHaveProperty("contact");
    expect(filtered.identity).not.toHaveProperty("openTo");
    expect(filtered.identity).not.toHaveProperty("causes");
    expect(filtered.identity).toMatchObject({
      name: "Alex Rivera",
      profileUrl: "https://www.linkedin.com/in/alex-rivera-fixture/"
    });
  });
});
