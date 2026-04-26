import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { checkExistingInstallation } from '../installer/validator.js';
import { loadManifest, saveManifest, buildManifest, hasFileBeenModified } from '../installer/manifest.js';
import { Writer } from '../installer/writer.js';
import { ENGINES } from '../installer/detector.js';

async function fetchLatestVersion(packageName) {
  try {
    const res = await fetch(`https://registry.npmjs.org/${packageName}/latest`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.version ?? null;
  } catch {
    return null;
  }
}

export default async function update(args) {
  const { default: chalk } = await import('chalk');
  const { default: ora } = await import('ora');
  const { default: semver } = await import('semver');

  const projectRoot = resolve(process.cwd());

  console.log(chalk.bold('\n  Reversa — Atualização\n'));

  // Verificar instalação
  const existing = checkExistingInstallation(projectRoot);
  if (!existing.installed) {
    console.log(chalk.yellow('  Reversa não está instalado neste diretório.'));
    console.log('  Execute ' + chalk.bold('npx reversa install') + ' para instalar.\n');
    return;
  }

  const installedVersion = existing.version;

  // Verificar versão no npm
  const spinner = ora({ text: 'Verificando versão mais recente...', color: 'cyan' }).start();
  const latestVersion = await fetchLatestVersion('reversa');
  spinner.stop();

  if (latestVersion) {
    const isOutdated = semver.lt(installedVersion, latestVersion);
    if (!isOutdated) {
      console.log(chalk.green(`  Você já está na versão mais recente (v${installedVersion}).\n`));
      return;
    }
    console.log(`  Versão instalada: ${chalk.yellow('v' + installedVersion)}`);
    console.log(`  Versão disponível: ${chalk.green('v' + latestVersion)}\n`);
  } else {
    console.log(chalk.gray(`  Versão instalada: v${installedVersion}`));
    console.log(chalk.gray('  Não foi possível verificar versão no npm. Continuando offline.\n'));
  }

  // Carregar manifest e verificar arquivos modificados
  const manifest = loadManifest(projectRoot);
  const state = existing.state;
  const installedAgents = state.agents ?? [];
  const installedEngineIds = state.engines ?? [];
  const installedEngines = ENGINES.filter(e => installedEngineIds.includes(e.id));

  const modified = [];
  const intact = [];

  for (const [relPath, hash] of Object.entries(manifest)) {
    const absPath = join(projectRoot, relPath);
    if (hasFileBeenModified(absPath, hash)) {
      modified.push(relPath);
    } else {
      intact.push(relPath);
    }
  }

  if (modified.length > 0) {
    console.log(chalk.yellow(`  ${modified.length} arquivo(s) modificado(s) por você (serão ignorados):`));
    modified.forEach(f => console.log(chalk.gray(`    ✎  ${f}`)));
    console.log('');
  }

  console.log(`  ${intact.length} arquivo(s) serão atualizados.`);
  if (intact.length === 0) {
    console.log(chalk.gray('  Nenhum arquivo para atualizar.\n'));
    return;
  }

  const { default: inquirer } = await import('inquirer');
  const { confirm } = await inquirer.prompt([{
    type: 'confirm',
    name: 'confirm',
    message: 'Confirmar atualização?',
    default: true,
  }]);

  if (!confirm) {
    console.log(chalk.gray('\n  Atualização cancelada.\n'));
    return;
  }

  const writer = new Writer(projectRoot);
  const updateSpinner = ora({ text: 'Atualizando agentes...', color: 'cyan' }).start();

  try {
    // Reinstalar skills para agentes × engines (apenas arquivos intactos)
    for (const agent of installedAgents) {
      for (const engine of installedEngines) {
        const skillDestDir = join(projectRoot, engine.skillsDir, agent);
        const relDir = skillDestDir.replace(projectRoot + '\\', '').replace(projectRoot + '/', '');
        const isModified = modified.some(f => f.startsWith(relDir));
        if (!isModified) {
          // Forçar reinstalação removendo o destino antes
          const { rmSync, existsSync: exists } = await import('fs');
          if (exists(skillDestDir)) rmSync(skillDestDir, { recursive: true, force: true });
          await writer.installSkill(agent, engine.skillsDir);
        }

        if (engine.universalSkillsDir && engine.universalSkillsDir !== engine.skillsDir) {
          const uSkillDestDir = join(projectRoot, engine.universalSkillsDir, agent);
          const uRelDir = uSkillDestDir.replace(projectRoot + '\\', '').replace(projectRoot + '/', '');
          const uIsModified = modified.some(f => f.startsWith(uRelDir));
          if (!uIsModified) {
            const { rmSync, existsSync: exists } = await import('fs');
            if (exists(uSkillDestDir)) rmSync(uSkillDestDir, { recursive: true, force: true });
            await writer.installSkill(agent, engine.universalSkillsDir);
          }
        }
      }
    }

    updateSpinner.text = 'Atualizando version...';

    // Atualizar arquivo de versão
    if (latestVersion) {
      const versionPath = join(projectRoot, '.reversa', 'version');
      writeFileSync(versionPath, latestVersion, 'utf8');

      // Atualizar state.json
      const statePath = join(projectRoot, '.reversa', 'state.json');
      const s = JSON.parse(readFileSync(statePath, 'utf8'));
      s.version = latestVersion;
      writeFileSync(statePath, JSON.stringify(s, null, 2), 'utf8');
    }

    updateSpinner.text = 'Atualizando manifesto...';

    // Reconstruir manifest com novos hashes
    const allFiles = writer.createdFiles.map(f => join(projectRoot, f));
    // Incluir arquivos existentes no manifest que continuam intactos
    const intactAbsPaths = intact.map(f => join(projectRoot, f));
    const newManifest = buildManifest([...new Set([...intactAbsPaths, ...allFiles])]);
    saveManifest(projectRoot, newManifest);

    writer.saveCreatedFiles();

    updateSpinner.succeed(chalk.green('Atualização concluída!'));
  } catch (err) {
    updateSpinner.fail(chalk.red('Erro durante a atualização.'));
    throw err;
  }

  if (modified.length > 0) {
    console.log(chalk.yellow(`\n  Atenção: ${modified.length} arquivo(s) foram mantidos pois foram modificados por você.`));
  }
  console.log('');
}
