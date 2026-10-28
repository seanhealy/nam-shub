# Test quality rubric

The nine properties a test needs to earn its place in the suite. Grade against
these and cite the numbers you're invoking, so the reasoning can be checked
rather than taken as a verdict.

This is a cleanup pass before the pull request goes up. Rough tests are useful
while the code is being written; judge the tests as they need to be from here
on, and don't editorialize about how they got written.

1. **Tests behaviour, not implementation.** It exercises the surface a caller
   uses. Renaming a private function, reordering internal calls, or swapping a
   data structure must not break it.
2. **Mocks the minimal set.** Only what can't run in a test: the network, the
   clock, a paid API, something slow or destructive. Every extra mock is an
   assumption about the implementation baked into the test.
3. **Covers the obvious edge cases.** Empty, absent, zero, negative, one, many,
   duplicate, too large, wrong type, and the error paths.
4. **Reads well as prose.** Someone reading only the test descriptions should
   come away understanding what the system does. The descriptions are the
   specification.
5. **Written for a junior developer.** Plain, common language. Say what happens
   in the domain's own words.
6. **Deterministic and isolated.** No dependence on the wall clock, the
   network, randomness, test order, or state another test left behind.
7. **Fails when the behaviour breaks, and only then.** No assertions that can't
   fail, no asserting on a value the test itself configured on a mock. And it
   stays green when only the implementation changes. A test that fails in both
   cases is noise; one that fails in neither is decoration.
8. **Fails with a diagnostic message.** The output alone says what broke and
   why.
9. **Setup reveals intent, and holds no logic.** The values that matter are
   visible in the test body, not buried in a shared factory default. No
   conditionals, loops, or computed expected values in the test.
