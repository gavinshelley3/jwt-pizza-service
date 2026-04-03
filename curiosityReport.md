# Curiosity Report: How CI/CD Pipelines Actually Work (and Why They Fail)

## Introduction

I chose to explore CI/CD pipelines because they always felt kind of like a black box to me. I knew they ran tests and deployed code, but I didn't really understand what was actually happening or how strict they really were.

While working on the JWT Pizza service, I got curious if every step in my pipeline actually mattered, or if some steps just looked important but weren't actually enforced. That led me to start experimenting with my pipeline and figure out what was really going on.

---

## What is CI/CD?

CI/CD stands for Continuous Integration and Continuous Deployment.

Continuous Integration is when your code gets automatically built and tested every time you push changes. Continuous Deployment is when your code gets deployed automatically after it passes those tests.

In this class, we used GitHub Actions to set this up so our code could be tested and deployed without doing everything manually. Automation is life!

---

## What Actually Happens in a CI Pipeline

Before doing this, I thought a pipeline just ran a list of commands and that was it. But after digging into it, I realized that each pipeline runs on a fresh machine and only fails if something explicitly returns an error.

That means a step can exist in the pipeline and look important, but not actually affect whether the pipeline passes or fails unless something checks it.

---

## Experimentation

I wanted to test whether my pipeline was actually enforcing everything it looked like it was doing.

First, I commented out the coverage badge generation step. I expected the pipeline to fail, but it still passed. That showed me that the step wasn't actually required, even though it looked like it was.

To fix that, I added a verification step that checks whether the badge files actually exist. After doing that, removing the badge generation step caused the pipeline to fail immediately. That made it clear that pipelines only enforce what you explicitly check.

```yaml
- name: Generate coverage badges
  run: npm run coverage:badges

- name: Verify coverage badges exist
  run: |
    test -f badges/coverage-lines.svg
    test -f badges/coverage-functions.svg
    test -f badges/coverage-branches.svg
    test -f badges/coverage-statements.svg
    test -f badges/coverage-total.svg
```

That single block from `.github/workflows/ci.yml` is what flipped the experiment: now the workflow aborts the moment any badge is missing, whether I'm on my laptop or the Ubuntu runner.

While doing this, I ran into another issue. On my local Windows machine, the badge generator would create the files, but then crash right after with a non-zero exit code. In CI (which runs on Linux), the same step worked fine.

So I had a situation where the output looked correct, but the process was still failing.

---

## Debugging and Fix

After digging into it, I found that the problem was how the badge generator was being run. Originally it used `npx` to call a CLI tool. On Windows, that caused a crash after the badges were already created.

To fix this, I stopped using the CLI and instead imported the badge generator directly in a Node script. That avoided spawning a separate process and fixed the issue on Windows.

I also made the script stricter by:

- checking that the coverage summary file exists
- running the badge generator
- verifying that all expected SVG files were created
- failing if anything was missing

This made the behavior consistent across environments and made sure failures were real instead of hidden.

---

## Custom Coverage Badge Workflow

Another part I explored was how coverage was actually being displayed.

The class had a standard way of reporting coverage, but I ended up implementing it a little differently so I could better understand what was happening.

Instead of relying only on a built-in approach, I created a script that:

- reads from `coverage/coverage-summary.json`
- generates SVG badge files locally
- stores them in the repository
- commits them through the CI pipeline so they show up in the README

This allowed me to display coverage directly in the GitHub README using image files that update automatically when the pipeline runs.

At the same time, I also kept the API-based approach that sends coverage data to an external endpoint. This means I now have two ways of tracking coverage:

- badge images stored in the repo
- coverage values sent to a remote service

Having both made it easier to verify that everything was working correctly, since I could compare the outputs.

While working on this, I realized that generating the badges locally and committing them through CI requires careful handling. If the pipeline doesn't detect changes or doesn't enforce the step, the badges might not update even if coverage changes.

This tied back into my earlier experiment, where I had to explicitly verify that the badge files were created in order to make the pipeline reliable.

---

## Additional Validation

To make sure everything was actually working, I decided to increase my test coverage and see if the badges would update correctly.

I added unit tests for the logger system, which previously had very low coverage. Before this, `logger.js` was around 16% covered. After adding tests for things like log levels, metadata handling, and masking sensitive data, coverage increased to around 60%.

When I reran the pipeline, the coverage badges updated to reflect the new values. This confirmed that the pipeline was actually enforcing and updating the badge output based on changes in the code.

This helped me verify that the system was working end to end, not just passing by accident.

### How to Reproduce the Experiment

1. Comment out the `Generate coverage badges` step above and push to a feature branch.
2. Trigger `workflow_dispatch` in GitHub Actions and note that the build now fails in the verification block.
3. Restore the step, run `npm run coverage:badges` locally (Windows + Linux), and confirm the script exits 0 and regenerates SVGs.
4. Inspect the badges committed by CI, then compare to the values sent to the remote coverage endpoint to double-check consistency.

---

## Why This Matters

This showed me that CI/CD is less about just running things automatically and more about enforcing rules.

If you don't explicitly check something, the pipeline can say everything is fine even when it's not. Once I added validation, the pipeline became much more reliable.

I also learned that tools can behave differently depending on the environment. Something can appear to work but still fail under the hood, which can cause confusing issues if you're not paying attention to exit codes.

---

## Connection to the Course

This connects directly to what we learned about GitHub Actions, automated testing, and deployment.

It builds on those concepts by showing how pipelines behave in real situations, especially when something isn't properly enforced or behaves differently across environments. It also ties into quality assurance by making sure outputs are actually correct instead of just assuming they are.

---

## What I Think

Before this, I thought CI/CD pipelines were pretty simple. Now I realize they can be misleading if you don't design them carefully.

The biggest thing I learned is that pipelines only enforce what you tell them to enforce. If you don't check for something, it might fail without you even realizing it.

I also thought it was interesting that a tool could create the correct output and still fail. That made me realize how important it is to look at exit codes and not just whether something "looks right."

Overall, this made CI/CD feel way less like a black box and more like something I can actually understand and improve.

---

## Conclusion

By experimenting with my pipeline, I learned that CI/CD only works as well as the checks you put in place.

After adding validation, finding a platform-specific issue, and fixing it, I was able to make my pipeline more reliable and actually enforce what it was supposed to do.

This helped me understand CI/CD in a much more practical way instead of just using it without really thinking about it.

---

## References

- GitHub Actions: [Workflow syntax for GitHub Actions](https://docs.github.com/actions/using-workflows/workflow-syntax-for-github-actions)
- node-coverage-badges CLI and API: [jpb06/node-coverage-badges](https://github.com/jpb06/node-coverage-badges)
- GitHub Actions runners: [About GitHub-hosted runners](https://docs.github.com/actions/using-github-hosted-runners/about-github-hosted-runners)
