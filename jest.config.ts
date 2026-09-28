import type { Config } from 'jest';

/**
 * Dos proyectos, porque las pruebas no corren con lo mismo:
 *
 * - `unit` usa dobles de Prisma y no necesita base de datos. Es lo que corre
 *   `pnpm test` y lo que tiene que quedar verde siempre.
 * - `integration` toca una base real (ver `tests/integration/setup-env.ts`), porque
 *   hay reglas que no se pueden verificar con un doble: el bloqueo de fila del
 *   correlativo fiscal es la primera. Corre con `pnpm test:integration`, en serie.
 */
const base = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  // El tsconfig usa `jsx: "preserve"` porque de eso se encarga Next. Las pruebas
  // sí necesitan el JSX ya transformado para poder renderizar la factura A4.
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: { jsx: 'react-jsx' } }],
  },
  clearMocks: true,
} satisfies Partial<Config>;

const config: Config = {
  projects: [
    {
      ...base,
      displayName: 'unit',
      roots: ['<rootDir>/tests'],
      testPathIgnorePatterns: ['<rootDir>/tests/integration/'],
    },
    {
      ...base,
      displayName: 'integration',
      roots: ['<rootDir>/tests/integration'],
      setupFiles: ['<rootDir>/tests/integration/setup-env.ts'],
    },
  ],
};

export default config;
