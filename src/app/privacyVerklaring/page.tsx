import React from 'react';

const PrivacyVerklaring: React.FC = () => {
  return (
    <main className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-4">Privacyverklaring Luisterslim</h1>
      <p className="text-sm text-gray-600">
        Versie: 24 juli 2025<br />
        Laatst gewijzigd: 24 juli 2025
      </p>

      <section className="mt-8">
        <h2 className="text-2xl font-semibold mb-2">1. Wie zijn wij?</h2>
        <p>
          Luisterslim (“wij”, “ons”), gevestigd aan [adres, postcode, plaats], ingeschreven bij de Kamer van Koophandel onder nummer [KvK‑nummer], is
          verwerkingsverantwoordelijke voor de verwerkingen beschreven in §3.1 en verwerker voor de verwerkingen beschreven in §3.2.
        </p>
        <ul className="list-disc list-inside mt-2 space-y-1">
          <li>E‑mail: [privacy@…]</li>
          <li>Tel.: [TBD]</li>
          <li>Website: [URL]</li>
          <li>Privacy‑contactpersoon: [naam / e‑mail]</li>
        </ul>
        <p className="mt-2 italic">
          (Er is geen formele Functionaris Gegevensbescherming (FG) aangesteld.)
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-2xl font-semibold mb-2">2. Rollen onder de AVG</h2>
        <p>
          <strong>Verwerkingsverantwoordelijke voor:</strong> websitebezoekers, accounts, facturatie, support, beveiligings- en gebruikslogging, cookies/analytics.
        </p>
        <p className="mt-2">
          <strong>Verwerker voor:</strong> audio‑ en transcriptiedata die wij uitsluitend in opdracht van onze klanten verwerken.
        </p>
        <p className="mt-2">
          <strong>Extern basismodel, onder onze regie:</strong><br />
          Wij licentiëren een extern geleverd basismodel (foundation model) en draaien/optimaliseren dit onder onze eigen regie.
          De leverancier van dit basismodel en de daarbij gebruikte rekencapaciteit kwalificeert als (sub)verwerker. Wij leggen dit vast in onze
          verwerkersovereenkomst (VWO) en informeren klanten over (wijzigingen in) subverwerkers.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-2xl font-semibold mb-2">3. Welke persoonsgegevens verwerken wij?</h2>
        <h3 className="text-xl font-medium mt-4">3.1. Als verwerkingsverantwoordelijke</h3>
        <ul className="list-disc list-inside mt-2 space-y-1">
          <li><strong>Identificatie- en contactgegevens:</strong> naam, e‑mail, telefoon, bedrijfsnaam, factuuradres.</li>
          <li><strong>Accountgegevens:</strong> login‑ID, gehasht wachtwoord, rollen/autorisaties.</li>
          <li><strong>Facturatiegegevens:</strong> transactie‑referenties, factuurnummers, betaalstatus.</li>
          <li><strong>Communicatie:</strong> supportverzoeken en e‑mailcorrespondentie.</li>
          <li><strong>Technische/loggegevens:</strong> IP‑adres, user‑agent, sessie‑ID’s, tijdstempels.</li>
          <li><strong>Cookies & vergelijkbare technieken:</strong> zie §12.</li>
        </ul>

        <h3 className="text-xl font-medium mt-6">3.2. Als verwerker (audio & transcripties)</h3>
        <ul className="list-disc list-inside mt-2 space-y-1">
          <li>Ruwe audio (bijv. lezingen, vergaderingen, meetings, gesprekken) en gegenereerde transcripties.</li>
          <li>Inhoud kan bijzondere persoonsgegevens bevatten (art. 9 AVG).</li>
          <li>Metadata: tijdstempels, duur, taal, (optioneel) sprekerdiarisatie.</li>
          <li>Audio bewaren wij niet; transcripties worden alleen opgeslagen als de klant dat kiest (zie §6).</li>
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-2xl font-semibold mb-2">4. Doeleinden en rechtsgronden</h2>
        <h3 className="text-xl font-medium mt-4">4.1. Verwerkingsverantwoordelijke</h3>
        <ul className="list-disc list-inside mt-2 space-y-1">
          <li><strong>Uitvoering overeenkomst (art. 6(1)(b) AVG):</strong> accounts, leveren dienst, facturatie, support.</li>
          <li><strong>Wettelijke verplichting (art. 6(1)(c) AVG):</strong> fiscale bewaarplicht.</li>
          <li><strong>Gerechtvaardigd belang (art. 6(1)(f) AVG):</strong> beveiliging (logging, fraudepreventie), productverbetering op geanonimiseerd/geaggregeerd niveau.</li>
          <li><strong>Toestemming (art. 6(1)(a) AVG):</strong> voor niet‑noodzakelijke cookies/marketing.</li>
        </ul>

        <h3 className="text-xl font-medium mt-6">4.2. Verwerker (audio & transcripties) — Variant A</h3>
        <ul className="list-disc list-inside mt-2 space-y-1">
          <li><strong>Uitvoering overeenkomst met onze klant (art. 6(1)(b) AVG):</strong> De klant is verantwoordelijk voor een geldige rechtsgrond richting betrokkenen en voor de informatieplicht.</li>
          <li>Wij gebruiken klantdata níet om onze modellen te trainen of te optimaliseren. Voor productverbetering gebruiken wij uitsluitend geanonimiseerde en geaggregeerde statistieken zonder herleidbaarheid naar personen (gerechtvaardigd belang, art. 6(1)(f) AVG).</li>
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-2xl font-semibold mb-2">5. Geautomatiseerde besluitvorming & profilering</h2>
        <p>
          Wij nemen geen besluiten met rechtsgevolgen voor personen die uitsluitend zijn gebaseerd op geautomatiseerde verwerking, en wij doen geen
          profilering die dergelijke effecten heeft. Onze AI‑functionaliteit zet audio om in tekst, maar beslist niet over personen.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-2xl font-semibold mb-2">6. Bewaartermijnen</h2>
        <p>Wij bewaren persoonsgegevens niet langer dan noodzakelijk. Standaard hanteren wij de volgende maxima (klanten kunnen kortere termijnen kiezen):</p>
        <table className="w-full text-left border-collapse mt-4">
          <thead>
            <tr>
              <th className="border px-2 py-1">Categorie</th>
              <th className="border px-2 py-1">Rol</th>
              <th className="border px-2 py-1">Bewaartermijn</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border px-2 py-1">Audio</td>
              <td className="border px-2 py-1">Verwerker</td>
              <td className="border px-2 py-1">0 dagen – wij bewaren ruwe audio niet na verwerking.</td>
            </tr>
            <tr>
              <td className="border px-2 py-1">Transcripties</td>
              <td className="border px-2 py-1">Verwerker</td>
              <td className="border px-2 py-1">Alleen opgeslagen indien de klant dat kiest. Max. [12 maanden] standaard.</td>
            </tr>
            <tr>
              <td className="border px-2 py-1">Accountgegevens</td>
              <td className="border px-2 py-1">Verwerkingsverantwoordelijke</td>
              <td className="border px-2 py-1">Zolang het account actief is + [24 maanden] inactief, daarna verwijderen/anonimiseren.</td>
            </tr>
            <tr>
              <td className="border px-2 py-1">Support/e‑mail</td>
              <td className="border px-2 py-1">Verwerkingsverantwoordelijke</td>
              <td className="border px-2 py-1">5 jaar.</td>
            </tr>
            <tr>
              <td className="border px-2 py-1">Facturatie/boekhouding</td>
              <td className="border px-2 py-1">Verwerkingsverantwoordelijke</td>
              <td className="border px-2 py-1">7 jaar.</td>
            </tr>
            <tr>
              <td className="border px-2 py-1">Security-/toegangslogs</td>
              <td className="border px-2 py-1">Verwerkingsverantwoordelijke</td>
              <td className="border px-2 py-1">[90 dagen].</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="mt-8">
        <h2 className="text-2xl font-semibold mb-2">7. Delen met derden (subverwerkers/verwerkers)</h2>
        <p>
          Wij schakelen (sub)verwerkers in uitsluitend waar nodig, met passende contracten. In de publieke verklaring noemen wij geen merknamen;
          een gespecificeerde lijst is op verzoek beschikbaar en/of is opgenomen in de verwerkersovereenkomst met klanten.
        </p>
        <ul className="list-disc list-inside mt-2 space-y-1">
          <li>Model- en rekencapaciteit op basis van een extern geleverd basismodel;</li>
          <li>Database- en hostingproviders;</li>
          <li>CDN/WAF & securityproviders;</li>
          <li>E‑mail- en supportsystemen;</li>
          <li>Betaalprovider.</li>
        </ul>
        <p className="mt-2">Wij verkopen geen persoonsgegevens.</p>
      </section>

      <section className="mt-8">
        <h2 className="text-2xl font-semibold mb-2">8. Doorgifte buiten de EER</h2>
        <p>
          Indien een (sub)verwerker onder wetgeving buiten de EER valt (bijv. VS), zorgen wij voor passende waarborgen conform hoofdstuk V AVG
          (o.a. SCC’s, Transfer Impact Assessment, eventuele aanvullende technische maatregelen) of baseren wij ons op een adequaatheidsbesluit.
          Dit is vastgelegd in ons verwerkingsregister en (voor klanten) in de verwerkersovereenkomst.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-2xl font-semibold mb-2">9. Beveiliging (technische & organisatorische maatregelen)</h2>
        <ul className="list-disc list-inside mt-2 space-y-1">
          <li>Encryptie in transit (TLS) en encryptie at rest.</li>
          <li>Least privilege / RBAC, periodieke rechtenreviews.</li>
          <li>(Aanbevolen) 2FA voor accounts met toegang tot productiegegevens.</li>
          <li>Logging & monitoring met audittrails.</li>
          <li>Incident- & datalekprocedure.</li>
          <li>Versleutelde back‑ups met beperkte retentie.</li>
          <li>Verwerkersovereenkomsten, SCC’s/TIA.</li>
          <li>Security by design & default, code reviews, dependency scanning.</li>
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-2xl font-semibold mb-2">10. Jouw rechten</h2>
        <p>
          Afhankelijk van onze rol (verantwoordelijke of verwerker) kun je o.a. recht hebben op inzage, rectificatie, wissing, beperking,
          dataportabiliteit, bezwaar en het intrekken van toestemming. Stuur je verzoek naar [privacy@luisterslim.nl]. We reageren binnen één maand
          (eventueel verlengd tot drie maanden bij complexiteit). Wanneer wij verwerker zijn, zullen wij je verzoek doorzetten naar
          onze klant.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-2xl font-semibold mb-2">11. Klacht bij de toezichthouder</h2>
        <p>Je kunt een klacht indienen bij de Autoriteit Persoonsgegevens (autoriteitpersoonsgegevens.nl).</p>
      </section>

      <section className="mt-8">
        <h2 className="text-2xl font-semibold mb-2">12. Cookies & vergelijkbare technieken</h2>
        <p>
          Onze CDN/WAF- en securityprovider kan noodzakelijke cookies plaatsen voor o.a. beveiliging, DDoS‑bescherming en performance.
        </p>
        <ul className="list-disc list-inside mt-2 space-y-1">
          <li><strong>Functionele/noodzakelijke cookies:</strong> geen toestemming vereist.</li>
          <li><strong>Analytische/marketingcookies:</strong> alleen indien wij ze inzetten en dan alleen met toestemming.</li>
        </ul>
        <p className="mt-2">
          Wij bieden (indien van toepassing) een cookievoorkeurencentrum. [Voeg een concrete cookietabel toe zodra je overzicht
          Cloudflare/overige cookies compleet is].
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-2xl font-semibold mb-2">13. DPIA & verwerkingsregister</h2>
        <p>
          Gezien wij mogelijk bijzondere persoonsgegevens verwerken in audio/transcripties, voeren wij — waar vereist — een Data
          Protection Impact Assessment (DPIA) uit en houden we een verwerkingsregister bij.
        </p>
      </section>

      <section className="mt-8 mb-8">
        <h2 className="text-2xl font-semibold mb-2">14. Wijzigingen</h2>
        <p>
          We kunnen deze privacyverklaring aanpassen. Bovenaan zie je altijd de datum van de laatste wijziging. Bij substantiële wijzigingen
          informeren we je actief.
        </p>
      </section>
    </main>
  );
};

export default PrivacyVerklaring;
