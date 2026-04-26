import { existsSync, readFileSync, rmSync, unlinkSync, statSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { checkExistingInstallation } from '../installer/validator.js';

export default async function uninstall(args) {
  const { default: chalk } = await import('chalk');
  const { default: inquirer } = await import('inquirer');

  const projectRoot = resolve(process.cwd());

  console.log(chalk.bold('\n  Reversa — Desinstalação\n'));

  const existing = checkExistingInstallation(projectRoot);
  if (!existing.installed) {
    console.log(chalk.yellow('  Reversa não está instalado neste diretório.\n'));
    return;
  }

  const state = existing.state;
  const createdFiles = state.created_files ?? [];
  const outputFolder = state.output_folder ?? '_reversa_sdd';

  // Separar arquivos em categorias para mostrar ao usuário
  const skillFiles = createdFiles.filter(f => f.includes('skills'));
  const entryFiles = createdFiles.filter(f =>
    ['CLAUDE.md', 'AGENTS.md', 'GEMINI.md', '.cursorrules', '.windsurfrules', '.gitignore']
      .some(name => f.endsWith(name))
  );
  const otherFiles = createdFiles.filter(f => !skillFiles.includes(f) && !entryFiles.includes(f));

  console.log('  Arquivos que serão removidos:\n');

  if (entryFiles.length > 0) {
    console.log(chalk.bold('  Arquivos de entrada:'));
    entryFiles.forEach(f => console.log(chalk.red(`    ✗  ${f}`)));
  }
  if (skillFiles.length > 0) {
    console.log(chalk.bold(`\n  Skills (${skillFiles.length} arquivo(s)):`));
    // Mostrar apenas as pastas únicas de skills para não poluir
    const skillDirs = [...new Set(skillFiles.map(f => f.split(/[/\\]/).slice(0, 3).join('/')))];
    skillDirs.forEach(d => console.log(chalk.red(`    ✗  ${d}/`)));
  }
  if (otherFiles.length > 0) {
    console.log(chalk.bold('\n  Outros:'));
    otherFiles.forEach(f => console.log(chalk.red(`    ✗  ${f}`)));
  }

  console.log(chalk.bold('\n  Pastas:'));
  console.log(chalk.red('    ✗  .reversa/'));

  const reversaDir = join(projectRoot, '.reversa');
  const outputDir = join(projectRoot, outputFolder);
  const hasOutputDir = existsSync(outputDir);

  if (hasOutputDir) {
    console.log(chalk.yellow(`    ?  ${outputFolder}/  (perguntado separadamente)`));
  }

  console.log('');

  // Confirmação explícita
  const { confirmed } = await inquirer.prompt([{
    type: 'input',
    name: 'confirmed',
    message: `Digite ${chalk.red('"remover"')} para confirmar a desinstalação:`,
    validate: (v) => v === 'remover' || 'Digite exatamente "remover" para confirmar.',
  }]);

  if (confirmed !== 'remover') {
    console.log(chalk.gray('\n  Desinstalação cancelada.\n'));
    return;
  }

  // Remover arquivos individualmente (apenas os criados pelo Reversa)
  let removed = 0;
  let errors = 0;

  for (const relPath of createdFiles) {
    const absPath = join(projectRoot, relPath);
    try {
      if (existsSync(absPath)) {
        const stat = statSync(absPath);
        if (stat.isDirectory()) {
          rmSync(absPath, { recursive: true, force: true });
        } else {
          unlinkSync(absPath);
        }
        removed++;
      }
    } catch {
      console.error(chalk.red(`    Erro ao remover: ${relPath}`));
      errors++;
    }
  }

  // Remover .reversa/ por inteiro
  try {
    if (existsSync(reversaDir)) {
      rmSync(reversaDir, { recursive: true, force: true });
      removed++;
    }
  } catch {
    console.error(chalk.red('    Erro ao remover .reversa/'));
    errors++;
  }

  // Perguntar sobre pasta de saída separadamente
  if (hasOutputDir) {
    console.log('');
    const { removeOutput } = await inquirer.prompt([{
      type: 'confirm',
      name: 'removeOutput',
      message: `Remover também a pasta de especificações ${chalk.cyan(outputFolder + '/')}?`,
      default: false,
    }]);

    if (removeOutput) {
      try {
        rmSync(outputDir, { recursive: true, force: true });
        console.log(chalk.red(`  ✗  ${outputFolder}/ removido.`));
      } catch {
        console.error(chalk.red(`  Erro ao remover ${outputFolder}/`));
      }
    } else {
      console.log(chalk.gray(`  → ${outputFolder}/ mantido.`));
    }
  }

  console.log('');
  if (errors === 0) {
    console.log(chalk.green('  Reversa removido com sucesso.\n'));
  } else {
    console.log(chalk.yellow(`  Concluído com ${errors} erro(s). Verifique os arquivos acima.\n`));
  }
}
