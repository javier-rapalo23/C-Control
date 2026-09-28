/**
 * Tiempo de espera de las pruebas de integración.
 *
 * Va acá y no solo en `jest.config.ts` porque el `testTimeout` del proyecto no
 * alcanza a los hooks (`beforeAll`/`afterAll`), y la preparación y limpieza de estas
 * suites hacen varias consultas contra la base de Railway.
 */
jest.setTimeout(60_000);
