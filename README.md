# Functional Descripiton
* An app that help user to record the land they visit, either by walking, hiking, or even driving by and traveling
* The app is supposed to run on mobile device
* It will use gps signal to identify where the user it is
* It will recognize the speed of the movement of the mobile device, autmatically classify what type of movement
* Whenever a land is cycled - the mobile device 'walk around' it, the land is claimed by the user.
* The more time a land is claim, the user should have higher score against the land
* A group can contains any number of users. (Need to think of a more fancy name for group)
* Each group should have a leader board, which will show more lands a user claims. (Rules should be refined to be a more sophisticated one, the goal is to encourage user for more movement/exercises)
* Should be able to show maps, the land on the map should be shown owner (who have the highest score) for that land. (Per group, user should be able to select default group, and should be able to switch groups)


# Non-Fuctional Descicription
* In v1, this should be run on ios (iphone), but with design that it could migrate to other mobile device
* In v1, it should support up to 100 users. In v2, it should support 10k user. In v3, it should support any number of users.
* In v1, no need to charge money. But we should discuss what potential business model to make the app profitable.

# Repo layout
* `SPEC.md`, `PLAN.md` – requirements and implementation plan
* `TODO.md` – deferred decisions and unverified items
* `api/openapi.yaml` – HTTP contract between clients and server
* `server/` – TypeScript (Node) server: `npm ci && npm test && npm run dev`
* `app-ios/` – SwiftUI app; generate the project with `xcodegen generate` (install: `brew install xcodegen`), then open `ConquerTheWorld.xcodeproj`
* Domain terms: `../GLOSSARY.md`; decisions: `../docs/adr/`
