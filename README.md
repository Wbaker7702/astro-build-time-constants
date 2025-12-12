# astro-build-time-constants

This Astro integration generates the file ```src/astro-build-time-constants.ts```,
which contains constants related to build time, typically:

```ts
export const digits2 = (number: number) => number < 10 ? '0' + number : '' + number
export const astroBuildTimeConstants = {
  internal: {
    epoch: 1758444256,
    seconds: 15,
    minutes: 44,
    hours: 8,
    fullYear: 2025,
    month: 9,
    date: 21,
    iso: "2025-09-21T08:44:15.899Z",
  },
  custom: {
    "myParam": "myValue",
    "myObject": {
      "myValue": 10
    }
  },
}
```

Internal objects contains built-in constants, such as the build date. All internal values are expressed in UTC to match the ISO timestamp.
The integration now resolves the file path from your Astro configuration, so
custom `srcDir` values are automatically supported and the target directory is
created when missing.

Custom object is the object passed as a parameter of ```buildTimeConstants()```
when initializing the integration in ```astro.config.mjs```. This ease usage
of custom configuration parameters

Usage in an astro components is then typically

```jsx
---
import { astroBuildTimeConstants } from '../astro-build-time-constants'
---
<p>
  Built on {astroBuildTimeConstants.internal.iso}
</p>
<p>
  My parameter is {astroBuildTimeConstants.custom.myParam}
</p>
```

## Security hardening

The integration now ships with two guardrails that help prevent accidental
secrets leakage and enforce authenticated build pipelines.

- **Secret scanning:** every property passed to `buildTimeConstants()` is scanned
  for suspicious keys such as `password`, `secret`, `token`, etc. The check
  fails fast on detection to avoid publishing sensitive data. If you want to
  intentionally surface a value, add its fully-qualified path (for example
  `custom.apiSecret`) to `security.secrets.allowList`, or downgrade the strictness
  to warnings with `security.secrets.mode = 'warn'`.
- **JWT-gated generation:** set the `ASTRO_BUILD_TIME_TOKEN` and
  `ASTRO_BUILD_TIME_SECRET` environment variables (or configure
  `security.jwt`) to require a signed JSON Web Token before the constants file
  is generated. Tokens are validated with HS256/384/512 signatures, standard
  `exp`, `nbf`, and `iat` claims, and optional `issuer`, `subject`, and
  `audience` restrictions.

```ts
import buildTimeConstants from 'astro-build-time-constants';

export default defineConfig({
  integrations: [
    buildTimeConstants(
      { featureFlag: true },
      {
        security: {
          secrets: {
            allowList: ['custom.safeToShare'],
          },
          jwt: {
            issuer: 'ci-bot',
            audience: 'astro-build',
            required: true,
          },
        },
      },
    ),
  ],
});
```

By default the JWT validator looks for `ASTRO_BUILD_TIME_TOKEN` and
`ASTRO_BUILD_TIME_SECRET`. Use `security.jwt.token`, `security.jwt.secret`,
or the `tokenEnvName` / `secretEnvName` overrides when you need different
names.

## Development workflow

To work on the integration locally in the development environment:

1. Install dependencies with `npm install`.
2. Run `npm run build` to emit the compiled package into `dist/`.
3. Run `npm test` to execute the Vitest suite that validates the generator logic.

The build script performs a TypeScript type check before generating the output,
and the prepare hook ensures `dist/` is always up to date before publishing.

## Installation

### Quick install

To install astro-build-time-constants, run the following from your project directory and follow the prompts:

```bash
npx astro add astro-build-time-constants
```

### Manual install

First, install the astro-build-time-constants package using your package manager. If you're using npm, run this in the terminal:

```bash
npm install astro-build-time-constants
```

Then, apply this integration to your ```astro.config.mjs``` file using the integrations property:

```js
import { defineConfig } from 'astro/config';
import buildTimeConstants from 'astro-build-time-constants'

export default defineConfig({
  integrations: [
    buildTimeConstants()
  ],
});
```


# Adding custom properties

Custom properties can be added as the ```buildTimeConstants()``` arguments, such as
```js
export default defineConfig({
  ...
  integrations: [
    ...
    buildTimeConstants( {
      myParam: "myValue",
      myObject: {
        myValue: 10,
      }
    }),
    ...
  ]
});

```
