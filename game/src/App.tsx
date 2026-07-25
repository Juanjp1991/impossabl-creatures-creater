import { useEffect, useMemo, useRef, useState } from "react";
import { allowedHybridCategories, assessPartCompatibility, validateHybridRecipe, type HybridPartAdjustmentV1, type HybridRecipeV1 } from "../../src/animalPackage/hybrid";
import type { AnatomicalCategory, AnimalPackageV1 } from "../../src/animalPackage/schema";
import { HybridPreview } from "./HybridPreview";
import { OFFICIAL_ANIMAL_LIBRARY } from "./library";
import { calculateCreatureBuild, runArenaBattle, type BattleResult } from "./gameplay";
import { createRecipe, parseSaveBundle, serializeSaveBundle } from "./recipes";
import { deleteRecipe, INITIAL_PROFILE, listRecipes, loadProfile, replaceRecipes, saveProfile, saveRecipe, type PlayerProfile } from "./storage";

const LIBRARY = OFFICIAL_ANIMAL_LIBRARY;
const makeId = () => globalThis.crypto?.randomUUID?.() ?? `hybrid-${Date.now()}`;

function download(filename: string, contents: string) {
  const url = URL.createObjectURL(new Blob([contents], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function sourceLabel(pkg: AnimalPackageV1, partId: string) {
  return `${pkg.name} · ${pkg.parts.find((part) => part.id === partId)?.name ?? partId}`;
}

export default function App() {
  const [recipe, setRecipe] = useState(() => createRecipe(LIBRARY[0], LIBRARY, makeId()));
  const [saved, setSaved] = useState<HybridRecipeV1[]>([]);
  const [profile, setProfile] = useState<PlayerProfile>(INITIAL_PROFILE);
  const [battle, setBattle] = useState<BattleResult | null>(null);
  const [status, setStatus] = useState("Local save is ready.");
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([listRecipes(), loadProfile()]).then(([recipes, player]) => { setSaved(recipes); setProfile(player); })
      .catch(() => setStatus("IndexedDB is unavailable in this browser."));
  }, []);

  const categories = allowedHybridCategories(recipe.anatomyTemplateId).filter((category) => category !== "body");
  const isUnlocked = (pkg: AnimalPackageV1) => profile.unlockedPackages.includes(`${pkg.animalId}@${pkg.assetVersion}`);
  const bodyAnimals = LIBRARY.filter((pkg) => pkg.anatomyTemplateId === recipe.anatomyTemplateId && (isUnlocked(pkg) || pkg.animalId === recipe.bodySource.animalId));
  const optionsFor = (category: AnatomicalCategory) => LIBRARY.filter((pkg) => isUnlocked(pkg) || recipe.parts[category]?.animalId === pkg.animalId)
    .flatMap((pkg) => pkg.parts.filter((part) => part.category === category).map((part) => ({ pkg, part })));
  const currentBody = LIBRARY.find((pkg) => pkg.animalId === recipe.bodySource.animalId && pkg.assetVersion === recipe.bodySource.assetVersion)!;
  const issues = useMemo(() => validateHybridRecipe(recipe, LIBRARY), [recipe]);
  const buildResult = useMemo(() => calculateCreatureBuild(recipe, LIBRARY), [recipe]);

  const update = (change: Partial<HybridRecipeV1>) => setRecipe((current) => ({ ...current, ...change, updatedAt: new Date().toISOString() }));
  const selectBody = (pkg: AnimalPackageV1) => {
    const replacement = createRecipe(pkg, LIBRARY, recipe.id, recipe.createdAt);
    setRecipe({ ...replacement, name: recipe.name, updatedAt: new Date().toISOString() });
  };
  const selectPart = (category: AnatomicalCategory, value: string) => {
    const [animalId, assetVersion, partId] = value.split("|");
    update({ parts: { ...recipe.parts, [category]: { animalId, assetVersion, partId } } });
  };
  const adjustPart = (category: AnatomicalCategory, key: keyof HybridPartAdjustmentV1, value: number) => {
    const existing = recipe.adjustments[category] ?? { scale: 1, offsetX: 0, offsetY: 0, rotation: 0 };
    update({ adjustments: { ...recipe.adjustments, [category]: { ...existing, [key]: value } } });
  };
  const persist = async () => {
    if (issues.length) return setStatus(issues[0].message);
    await saveRecipe(recipe);
    setSaved(await listRecipes());
    setStatus(`Saved “${recipe.name}” as a compact recipe.`);
  };
  const testInArena = async () => {
    if (issues.length) return;
    const result = runArenaBattle(buildResult, profile.wins);
    const next = { ...profile, battles: profile.battles + 1, wins: profile.wins + (result.won ? 1 : 0), geneCredits: profile.geneCredits + result.reward };
    setBattle(result);
    setProfile(next);
    await saveProfile(next);
    setStatus(`${result.won ? "Arena victory" : "Arena data collected"}: +${result.reward} gene credits.`);
  };
  const unlock = async (pkg: AnimalPackageV1) => {
    const key = `${pkg.animalId}@${pkg.assetVersion}`;
    if (profile.geneCredits < 30 || profile.unlockedPackages.includes(key)) return;
    const next = { ...profile, geneCredits: profile.geneCredits - 30, unlockedPackages: [...profile.unlockedPackages, key] };
    setProfile(next);
    await saveProfile(next);
    setStatus(`${pkg.name} unlocked for hybrid building.`);
  };
  const remove = async (id: string) => {
    await deleteRecipe(id);
    const next = await listRecipes();
    setSaved(next);
    if (id === recipe.id) setRecipe(createRecipe(LIBRARY[0], LIBRARY, makeId()));
    setStatus("Creature deleted from this device.");
  };
  const importSaves = async (file?: File) => {
    if (!file) return;
    try {
      const bundle = parseSaveBundle(await file.text());
      for (const imported of bundle.recipes) {
        const importedIssues = validateHybridRecipe(imported, LIBRARY);
        if (importedIssues.length) throw new Error(`${imported.name || "Recipe"}: ${importedIssues[0].message}`);
      }
      await replaceRecipes(bundle.recipes);
      if (bundle.player) { await saveProfile(bundle.player); setProfile(bundle.player); }
      setSaved(await listRecipes());
      if (bundle.recipes[0]) setRecipe(bundle.recipes[0]);
      setStatus(`Imported ${bundle.recipes.length} local creature${bundle.recipes.length === 1 ? "" : "s"}.`);
    } catch (error) { setStatus(error instanceof Error ? error.message : "Import failed."); }
    finally { if (importRef.current) importRef.current.value = ""; }
  };

  return <div className="app-shell">
    <header className="topbar">
      <div><span className="eyebrow">OFFLINE LAB · PACKAGE V1</span><h1>Creature Forge</h1></div>
      <div className="status"><span className="status-dot" />{status}</div>
    </header>

    <main>
      <section className="hero-panel">
        <div className="preview-card">
          <div className="preview-heading"><span>{recipe.name || "Unnamed hybrid"}</span><small>{currentBody.anatomyTemplateId} anatomy</small></div>
          <HybridPreview recipe={recipe} library={LIBRARY} />
          <div className="preview-stripe"><span>ANIMATED SPECIMEN</span><span>{Object.keys(recipe.parts).length} LINKED PARTS</span></div>
        </div>

        <div className="creator-card">
          <span className="step">01 · IDENTITY</span>
          <label>Creature name<input value={recipe.name} maxLength={48} onChange={(event) => update({ name: event.target.value })} /></label>
          <div className="two-col">
            <label>Primary colour<input type="color" value={recipe.colours.primary} onChange={(event) => update({ colours: { ...recipe.colours, primary: event.target.value } })} /></label>
            <label>Accent colour<input type="color" value={recipe.colours.accent} onChange={(event) => update({ colours: { ...recipe.colours, accent: event.target.value } })} /></label>
          </div>

          <span className="step">02 · BODY BLUEPRINT</span>
          <div className="template-tabs">{(["quadruped", "bird", "serpentine", "scorpion"] as const).map((template) =>
            <button className={recipe.anatomyTemplateId === template ? "active" : ""} key={template} onClick={() => selectBody(LIBRARY.find((pkg) => pkg.anatomyTemplateId === template && isUnlocked(pkg))!)}>{template}</button>)}</div>
          <label>Body source<select value={`${currentBody.animalId}|${currentBody.assetVersion}`} onChange={(event) => {
            const [animalId, version] = event.target.value.split("|");
            selectBody(LIBRARY.find((pkg) => pkg.animalId === animalId && pkg.assetVersion === version)!);
          }}>{bodyAnimals.map((pkg) => <option key={pkg.animalId} value={`${pkg.animalId}|${pkg.assetVersion}`}>{pkg.name} · v{pkg.assetVersion}</option>)}</select></label>

          <span className="step">03 · COMPATIBLE PARTS</span>
          <div className="part-grid">{categories.map((category) => {
            const selection = recipe.parts[category]!;
            const value = `${selection.animalId}|${selection.assetVersion}|${selection.partId}`;
            const adjustment = recipe.adjustments[category] ?? { scale: 1, offsetX: 0, offsetY: 0, rotation: 0 };
            const selectedSource = LIBRARY.find((pkg) => pkg.animalId === selection.animalId && pkg.assetVersion === selection.assetVersion)!;
            const selectedPart = selectedSource.parts.find((part) => part.id === selection.partId)!;
            const compatibility = assessPartCompatibility(currentBody, selectedSource, selectedPart, category);
            return <div className="part-row" key={category}>
              <label><span className="part-label"><b>{category}</b><span className={`compat-badge ${compatibility.status}`}>{compatibility.status}</span></span><select value={value} onChange={(event) => selectPart(category, event.target.value)}>{optionsFor(category).map(({ pkg, part }) => <option key={`${pkg.animalId}-${part.id}`} value={`${pkg.animalId}|${pkg.assetVersion}|${part.id}`}>{sourceLabel(pkg, part.id)}</option>)}</select>{compatibility.warnings.length > 0 && <small className="compat-warning" title={compatibility.warnings.map((entry) => `${entry.code}: ${entry.message}`).join("\n")}>{compatibility.warnings.map((entry) => entry.message).join(" ")}</small>}</label>
              <label className="range">Scale <input type="range" min="0.7" max="1.3" step="0.05" value={adjustment.scale} onChange={(event) => adjustPart(category, "scale", Number(event.target.value))} /></label>
              <label className="range">Rotate <input type="range" min="-25" max="25" step="1" value={adjustment.rotation} onChange={(event) => adjustPart(category, "rotation", Number(event.target.value))} /></label>
            </div>;
          })}</div>
          <div className="actions"><button className="primary" disabled={Boolean(issues.length)} onClick={testInArena}>Test in arena</button><button disabled={Boolean(issues.length)} onClick={persist}>Save creature</button><button onClick={() => { setRecipe(createRecipe(currentBody, LIBRARY, makeId())); setBattle(null); }}>New recipe</button></div>
        </div>
      </section>

      <section className="gameplay-grid">
        <div className="result-card">
          <div className="section-heading"><div><span className="eyebrow">BUILD ANALYSIS</span><h2>Creature result card</h2></div><strong>{buildResult.locomotion}</strong></div>
          <div className="stats-row">{Object.entries(buildResult.stats).map(([name, value]) => <div key={name}><span>{name}</span><b>{value}</b></div>)}</div>
          <div className="contribution-list">{buildResult.contributions.map((item) => <div key={item.category}>
            <span><b>{item.category}</b><small>{item.animalName}</small></span>
            <code>+{item.stats.health} HP · +{item.stats.power} POW · +{item.stats.armor} ARM · +{item.stats.speed} SPD</code>
          </div>)}</div>
        </div>
        <div className="arena-card">
          <div className="section-heading"><div><span className="eyebrow">COMBAT TEST</span><h2>{battle ? (battle.won ? "Victory" : "Defeat") : "Arena ready"}</h2></div><div className="credits">◈ {profile.geneCredits}</div></div>
          {battle ? <div className="battle-result"><p>vs. <b>{battle.opponent}</b> · {battle.rounds} rounds · {battle.remainingHealth} health left</p><strong>+{battle.reward} gene credits</strong><ol>{battle.log.slice(-4).map((line, index) => <li key={`${line}-${index}`}>{line}</li>)}</ol></div>
            : <p className="empty">Test this build in a short automatic battle. Part statistics, speed and armor determine the result.</p>}
          <div className="progress-line"><span>{profile.wins} wins / {profile.battles} battles</span><span>Unlock cost: 30 ◈</span></div>
        </div>
      </section>

      <section className="unlock-lab">
        <div className="section-heading"><div><span className="eyebrow">REWARD · UNLOCK · IMPROVE</span><h2>Official gene library</h2></div><div className="credits">◈ {profile.geneCredits} credits</div></div>
        <div className="unlock-grid">{LIBRARY.map((pkg) => { const unlocked = isUnlocked(pkg); return <article key={pkg.animalId} className={unlocked ? "unlocked" : "locked"}>
          <div><b>{pkg.name}</b><small>{pkg.anatomyTemplateId} · {pkg.gameplay?.traits?.join(" / ")}</small></div>
          {unlocked ? <span>AVAILABLE</span> : <button disabled={profile.geneCredits < 30} onClick={() => unlock(pkg)}>Unlock · 30 ◈</button>}
        </article>; })}</div>
      </section>

      <section className="vault">
        <div className="section-heading"><div><span className="eyebrow">DEVICE STORAGE</span><h2>Local creature vault</h2></div><div className="actions"><button onClick={() => download("creature-game-saves.json", serializeSaveBundle(saved, new Date().toISOString(), profile))}>Export saves</button><button onClick={() => importRef.current?.click()}>Import saves</button><input ref={importRef} type="file" accept="application/json,.json" hidden onChange={(event) => importSaves(event.target.files?.[0])} /></div></div>
        {saved.length ? <div className="saved-grid">{saved.map((item) => <article key={item.id}>
          <HybridPreview recipe={item} library={LIBRARY} animated={false} />
          <div><h3>{item.name}</h3><p>{item.anatomyTemplateId} · {Object.keys(item.parts).length} package references</p></div>
          <div className="actions"><button onClick={() => setRecipe(item)}>Load</button><button className="danger" onClick={() => remove(item.id)}>Delete</button></div>
        </article>)}</div> : <p className="empty">No saved hybrids yet. Your creatures stay on this device and contain references—not copied SVG artwork.</p>}
      </section>
    </main>
    <footer>Official library: {LIBRARY.length} animals · Works offline after first load · Recipes remain portable JSON</footer>
  </div>;
}
