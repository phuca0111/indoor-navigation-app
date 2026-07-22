const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const CONTROLLERS_DIR = path.join(ROOT, 'controllers');
const MODELS_DIR = path.join(ROOT, 'models');
const {
  MIGRATED_BOUNDARIES,
  CONTROLLED_EXCEPTIONS
} = require('./controlledExceptions');
const MIGRATED_BILLING_SERVICES = MIGRATED_BOUNDARIES.phase2.services;
const MIGRATED_BILLING_CONTROLLERS = MIGRATED_BOUNDARIES.phase2.controllers;
const MIGRATED_CORE_TENANT_SERVICES = MIGRATED_BOUNDARIES.phase3.services;
const MIGRATED_CORE_TENANT_CONTROLLERS = MIGRATED_BOUNDARIES.phase3.controllers;
const MIGRATED_MAP_LIFECYCLE_SERVICES = MIGRATED_BOUNDARIES.phase4.services;
const MIGRATED_MAP_LIFECYCLE_CONTROLLERS = MIGRATED_BOUNDARIES.phase4.controllers;
const MIGRATED_IDENTITY_SERVICES = MIGRATED_BOUNDARIES.phase5.services;
const MIGRATED_IDENTITY_CONTROLLERS = MIGRATED_BOUNDARIES.phase5.controllers;
const MIGRATED_CONTENT_SERVICES = MIGRATED_BOUNDARIES.phase6.services;
const MIGRATED_CONTENT_CONTROLLERS = MIGRATED_BOUNDARIES.phase6.controllers;
const MIGRATED_READ_SERVICES = MIGRATED_BOUNDARIES.phase7.services;
const MIGRATED_READ_CONTROLLERS = MIGRATED_BOUNDARIES.phase7.controllers;

function walkJavaScriptFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) return walkJavaScriptFiles(target);
      return entry.isFile() && entry.name.endsWith('.js') ? [target] : [];
    });
}

function normalizeRelative(filepath) {
  return path.relative(ROOT, filepath).split(path.sep).join('/');
}

function resolveLocalModule(sourceFile, specifier) {
  if (!specifier.startsWith('.')) return null;
  const resolved = path.resolve(path.dirname(sourceFile), specifier);
  return path.extname(resolved) ? resolved : `${resolved}.js`;
}

function collectModelImportEdges(directory) {
  const edgeOccurrences = new Map();
  const importPattern =
    /(?:require\s*\(\s*|from\s+)['"]([^'"]+)['"]/g;

  for (const sourceFile of walkJavaScriptFiles(directory)) {
    const source = fs.readFileSync(sourceFile, 'utf8');
    let match;
    while ((match = importPattern.exec(source)) !== null) {
      const target = resolveLocalModule(sourceFile, match[1]);
      if (!target) continue;

      const relativeToModels = path.relative(MODELS_DIR, target);
      const isModel = relativeToModels
        && !relativeToModels.startsWith('..')
        && !path.isAbsolute(relativeToModels);
      if (!isModel) continue;

      const edge = `${normalizeRelative(sourceFile)} -> ${normalizeRelative(target)}`;
      edgeOccurrences.set(edge, (edgeOccurrences.get(edge) || 0) + 1);
    }
  }

  return [...edgeOccurrences.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([edge, occurrences]) => ({ edge, occurrences }));
}

function collectForbiddenPersistenceImports(relativeFiles) {
  const violations = [];
  const importPattern =
    /(?:require\s*\(\s*|from\s+)['"]([^'"]+)['"]/g;

  for (const relativeFile of relativeFiles) {
    const sourceFile = path.join(ROOT, relativeFile);
    const source = fs.readFileSync(sourceFile, 'utf8');
    let match;
    while ((match = importPattern.exec(source)) !== null) {
      const specifier = match[1];
      const target = resolveLocalModule(sourceFile, specifier);
      const relativeToModels = target ? path.relative(MODELS_DIR, target) : null;
      const importsModel = relativeToModels
        && !relativeToModels.startsWith('..')
        && !path.isAbsolute(relativeToModels);
      if (specifier === 'mongoose' || importsModel) {
        violations.push(`${relativeFile} -> ${specifier}`);
      }
    }
  }

  return violations.sort();
}

function collectRepositoryImports(relativeFiles) {
  const violations = [];
  const importPattern =
    /(?:require\s*\(\s*|from\s+)['"]([^'"]+)['"]/g;

  for (const relativeFile of relativeFiles) {
    const sourceFile = path.join(ROOT, relativeFile);
    const source = fs.readFileSync(sourceFile, 'utf8');
    let match;
    while ((match = importPattern.exec(source)) !== null) {
      const target = resolveLocalModule(sourceFile, match[1]);
      if (!target) continue;
      const relativeToRepositories = path.relative(
        path.join(ROOT, 'repositories'),
        target
      );
      if (
        relativeToRepositories &&
        !relativeToRepositories.startsWith('..') &&
        !path.isAbsolute(relativeToRepositories)
      ) {
        violations.push(`${relativeFile} -> ${match[1]}`);
      }
    }
  }
  return violations.sort();
}

function collectImportsIntoDirectory(sourceDirectories, targetDirectory) {
  const edges = [];
  const importPattern = /(?:require\s*\(\s*|from\s+)['"]([^'"]+)['"]/g;
  const targetRoot = path.join(ROOT, targetDirectory);

  for (const directory of sourceDirectories) {
    const absoluteDirectory = path.join(ROOT, directory);
    for (const sourceFile of walkJavaScriptFiles(absoluteDirectory)) {
      const source = fs.readFileSync(sourceFile, 'utf8');
      let match;
      while ((match = importPattern.exec(source)) !== null) {
        const target = resolveLocalModule(sourceFile, match[1]);
        if (!target) continue;
        const relativeTarget = path.relative(targetRoot, target);
        if (
          relativeTarget &&
          !relativeTarget.startsWith('..') &&
          !path.isAbsolute(relativeTarget)
        ) {
          edges.push({
            source: normalizeRelative(sourceFile),
            target: normalizeRelative(target)
          });
        }
      }
    }
  }
  return edges.sort((left, right) => (
    `${left.source}->${left.target}`.localeCompare(`${right.source}->${right.target}`)
  ));
}

describe('Target Architecture v2 — persistence boundaries', () => {
  test('Controller legacy Model imports không được tăng ngoài baseline đã review', () => {
    const currentEdges = collectModelImportEdges(CONTROLLERS_DIR);

    expect(currentEdges).toMatchSnapshot();
  });

  test('Controller Phase 3 không còn import Model', () => {
    const edges = collectModelImportEdges(CONTROLLERS_DIR);
    expect(edges.filter(({ edge }) => (
      edge.startsWith('controllers/buildingController.js ->') ||
      edge.startsWith('controllers/organizationController.js ->') ||
      edge.startsWith('controllers/mapController.js ->')
    ))).toEqual([]);
  });

  test('Controller Phase 3 chỉ gọi Application/legacy lifecycle boundary', () => {
    expect(collectForbiddenPersistenceImports(MIGRATED_CORE_TENANT_CONTROLLERS)).toEqual([]);
    expect(collectRepositoryImports(MIGRATED_CORE_TENANT_CONTROLLERS)).toEqual([]);
  });

  test('Billing services đã migrate không import Model hoặc mongoose', () => {
    expect(collectForbiddenPersistenceImports(MIGRATED_BILLING_SERVICES)).toEqual([]);
  });

  test('Billing controllers đã migrate không truy cập persistence trực tiếp', () => {
    expect(collectForbiddenPersistenceImports(MIGRATED_BILLING_CONTROLLERS)).toEqual([]);
    expect(collectRepositoryImports(MIGRATED_BILLING_CONTROLLERS)).toEqual([]);
  });

  test('Application Service Phase 3 không import Model hoặc mongoose', () => {
    expect(collectForbiddenPersistenceImports(MIGRATED_CORE_TENANT_SERVICES)).toEqual([]);
  });

  test('Phase 4 controller chỉ gọi Application/Query Service', () => {
    expect(collectForbiddenPersistenceImports(MIGRATED_MAP_LIFECYCLE_CONTROLLERS)).toEqual([]);
    expect(collectRepositoryImports(MIGRATED_MAP_LIFECYCLE_CONTROLLERS)).toEqual([]);
  });

  test('Phase 4 write/query service không import Model hoặc mongoose', () => {
    expect(collectForbiddenPersistenceImports(MIGRATED_MAP_LIFECYCLE_SERVICES)).toEqual([]);
  });

  test('Phase 5 controller chỉ gọi Application Service', () => {
    expect(collectForbiddenPersistenceImports(MIGRATED_IDENTITY_CONTROLLERS)).toEqual([]);
    expect(collectRepositoryImports(MIGRATED_IDENTITY_CONTROLLERS)).toEqual([]);
  });

  test('Phase 5 Application/compatibility service không import Model hoặc mongoose', () => {
    expect(collectForbiddenPersistenceImports(MIGRATED_IDENTITY_SERVICES)).toEqual([]);
  });

  test('Phase 6 controller chỉ gọi Application/Query Service', () => {
    expect(collectForbiddenPersistenceImports(MIGRATED_CONTENT_CONTROLLERS)).toEqual([]);
    expect(collectRepositoryImports(MIGRATED_CONTENT_CONTROLLERS)).toEqual([]);
  });

  test('Phase 6 Application/worker không import Model hoặc mongoose', () => {
    expect(collectForbiddenPersistenceImports(MIGRATED_CONTENT_SERVICES)).toEqual([]);
  });

  test('Phase 7 controller chỉ gọi Application/Query Service', () => {
    expect(collectForbiddenPersistenceImports(MIGRATED_READ_CONTROLLERS)).toEqual([]);
    expect(collectRepositoryImports(MIGRATED_READ_CONTROLLERS)).toEqual([]);
  });

  test('Phase 7 Application/read service không import Model hoặc mongoose', () => {
    expect(collectForbiddenPersistenceImports(MIGRATED_READ_SERVICES)).toEqual([]);
  });

  test('controlled exceptions có owner phase và edge cụ thể, không dùng glob', () => {
    const ids = new Set();
    for (const exception of CONTROLLED_EXCEPTIONS) {
      expect(exception).toEqual(expect.objectContaining({
        id: expect.any(String),
        ownerPhase: expect.stringMatching(/^phase[2-7]$/),
        kind: expect.any(String),
        source: expect.stringMatching(/\.js$/),
        target: expect.stringMatching(/\.js$/),
        reason: expect.any(String)
      }));
      expect(exception.source).not.toMatch(/[*?]/);
      expect(exception.target).not.toMatch(/[*?]/);
      expect(fs.existsSync(path.join(ROOT, exception.source))).toBe(true);
      expect(fs.existsSync(path.join(ROOT, exception.target))).toBe(true);
      expect(ids.has(exception.id)).toBe(false);
      ids.add(exception.id);
    }
  });

  test('Service không import Controller ngoài controlled exceptions có owner', () => {
    const current = collectImportsIntoDirectory(
      ['services', 'application'],
      'controllers'
    );
    const allowed = CONTROLLED_EXCEPTIONS
      .filter((exception) => exception.kind === 'SERVICE_TO_CONTROLLER')
      .map(({ source, target }) => ({ source, target }))
      .sort((left, right) => (
        `${left.source}->${left.target}`.localeCompare(`${right.source}->${right.target}`)
      ));
    expect(current).toEqual(allowed);
  });

  test('Phase 7 read persistence chỉ tồn tại trong registry có owner', () => {
    const allowed = CONTROLLED_EXCEPTIONS
      .filter((exception) => exception.kind === 'READ_MODEL_PERSISTENCE')
      .map(({ source, target }) => ({ source, target }))
      .sort((left, right) => (
        `${left.source}->${left.target}`.localeCompare(`${right.source}->${right.target}`)
      ));
    const controlledSources = new Set(allowed.map((edge) => edge.source));
    const current = collectModelImportEdges(path.join(ROOT, 'services'))
      .map(({ edge }) => {
        const [source, target] = edge.split(' -> ');
        return { source, target };
      })
      .filter((edge) => controlledSources.has(edge.source))
      .sort((left, right) => (
        `${left.source}->${left.target}`.localeCompare(`${right.source}->${right.target}`)
      ));
    expect(current).toEqual(allowed);
  });
});

module.exports = {
  collectModelImportEdges,
  collectForbiddenPersistenceImports,
  collectRepositoryImports,
  collectImportsIntoDirectory,
  resolveLocalModule,
  walkJavaScriptFiles
};
