import { existsSync, readFileSync, writeFileSync, readdirSync } from 'fs';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { checkExistingInstallation } from '../installer/validator.js';
import { Writer } from '../installer/writer.js';
import { loadManifest, saveManifest, buildManifest } from '../installer/manifest.js';
import { ENGINES } from '../installer/detector.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const AGENTS_DIR = join(REPO_ROOT, 'agents');

const AGENT_LABELS = {
  'reversa-maestro':      'Maestro — orquestrador central',
  'reversa-scout':        'Scout — reconhecimento',
  'reversa-arqueologo':   'Arqueólogo — escavação',
  'reversa-detetive':     'Detetive — interpretação',
  'reversa-arquiteto':    'Arquiteto — síntese arquitetural',
  'reversa-redator':      'Redator — geração de specs',
  'reversa-advogado':     'Advogado do Diabo — revisão e validação',
  'reversa-tracer':       'Tracer — análise dinâmica',
  'reversa-visor':        'Visor — análise de interface via screenshots',
  'reversa-data-master':  'Data Master — análise de banco de dados',
  'reversa-design-system':'Design System — tokens de design e temas',
};

export default async function addAgent(args) {
  const { default: chalk } = await import('chalk');
  const { default: inquirer } = await import('inquirer');

  const projectRoot = resolve(process.cwd());

  console.log(chalk.bold('\n  Reversa — Adicionar Agente\n'));

  const existing = checkExistingInstallation(projectRoot);
  if (!existing.installed) {
    console.log(chalk.yellow('  Reversa não está instalado neste diretório.'));
    console.log('  Execute ' + chalk.bold('npx reversa install') + ' para instalar.\n');
    return;
  }

  const state = existing.state;
  const installedAgents = new Set(state.agents ?? []);
  const installedEngineIds = state.engines ?? [];
  const installedEngines = ENGINES.filter(e => installedEngineIds.includes(e.id));

  // Listar agentes disponíveis mas não instalados
  let availableAgents = [];
  try {
    availableAgents = readdirSync(AGENTS_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name)
      .filter(name => !installedAgents.has(name));
  } catch {
    console.log(chalk.red('  Não foi possível ler a pasta de agentes.\n'));
    return;
  }

  if (availableAgents.length === 0) {
    console.log(chalk.green('  Todos os agentes disponíveis já estão instalados.\n'));
    return;
  }

  const choices = availableAgents.map(id => ({
    name: AGENT_LABELS[id] ?? id,
    value: id,
    checked: true,
  }));

  const { selected } = await inquirer.prompt([{
    type: 'checkbox',
    name: 'selected',
    message: 'Selecione os agentes a adicionar:',
    choices,
    validate: (v) => v.length > 0 || 'Selecione ao menos um agente.',
  }]);

  const writer = new Writer(projectRoot);

  for (const agent of selected) {
    for (const engine of installedEngines) {
      await writer.installSkill(agent, engine.skillsDir);

      if (engine.universalSkillsDir && engine.universalSkillsDir !== engine.skillsDir) {
        await writer.installSkill(agent, engine.universalSkillsDir);
      }
    }
    console.log(chalk.green(`  ✓  ${AGENT_LABELS[agent] ?? agent}`));
  }

  // Atualizar state.json
  const statePath = join(projectRoot, '.reversa', 'state.json');
  const s = JSON.parse(readFileSync(statePath, 'utf8'));
  s.agents = [...new Set([...(s.agents ?? []), ...selected])];
  writeFileSync(statePath, JSON.stringify(s, null, 2), 'utf8');

  writer.saveCreatedFiles();

  // Atualizar manifest
  const existingManifest = loadManifest(projectRoot);
  const newFiles = writer.createdFiles.map(f => join(projectRoot, f));
  const newManifest = buildManifest(newFiles);
  saveManifest(projectRoot, { ...existingManifest, ...newManifest });

  console.log(chalk.bold(`\n  ${selected.length} agente(s) adicionado(s) com sucesso.\n`));
}
