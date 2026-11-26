# Issue tracker

Issues live in GitHub Issues for `knightseu/Conquer-the-World`. Use the `gh` CLI for everything.

## Basics

- Create: `gh issue create --title "<title>" --body-file <file> --label <label>`
- Read: `gh issue view <n> --comments`
- Comment: `gh issue comment <n> --body-file <file>`
- Close: `gh issue close <n> --comment "<why>"`
- Assign yourself: `gh issue edit <n> --add-assignee @me`

Refer to issues by title in prose; the number rides inside the link.

## Wayfinding operations

GitHub has native sub-issues and native blocking, so wayfinding uses both. The REST endpoints take the issue's **database id**, not its number: get it with `gh api repos/knightseu/Conquer-the-World/issues/<n> --jq .id`.

| Operation | How |
|---|---|
| Map | One issue labelled `wayfinder:map`. |
| Ticket type | Label `wayfinder:research`, `wayfinder:prototype`, `wayfinder:grilling` or `wayfinder:task`. No other labels on map or tickets. |
| Make a ticket a child of the map | `gh api -X POST repos/knightseu/Conquer-the-World/issues/<map>/sub_issues -F sub_issue_id=<ticket database id>` |
| List the map's tickets | `gh api repos/knightseu/Conquer-the-World/issues/<map>/sub_issues --paginate` |
| Ticket A is blocked by ticket B | `gh api -X POST repos/knightseu/Conquer-the-World/issues/<A>/dependencies/blocked_by -F issue_id=<B database id>` |
| What blocks a ticket | `gh api repos/knightseu/Conquer-the-World/issues/<n>/dependencies/blocked_by` |
| Claim | Assign the ticket to the dev driving the map (`--add-assignee @me`). Unassigned + open = unclaimed. |
| Frontier | Open sub-issues of the map, with no assignee, whose `blocked_by` list has no open issues. |
| Resolve | Post the answer as a comment, close the issue, add a line to the map's "Decisions so far". |
