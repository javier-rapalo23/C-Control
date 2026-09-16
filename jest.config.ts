import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  // El tsconfig usa `jsx: "preserve"` porque de eso se encarga Next. Las pruebas
  // sí necesitan el JSX ya transformado para poder renderizar la factura A4.
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: { jsx: 'react-jsx' } }],
  },
  clearMocks: true,
};

export default config;
