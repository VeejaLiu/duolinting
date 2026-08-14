-- Opens a development URL in Edge exactly once.
-- The caller provides both loopback spellings because Expo may expose localhost
-- while the VSCode task uses 127.0.0.1 for the same local service.
on run argv
  if (count of argv) is not 2 then
    error "Expected a primary URL and its equivalent localhost URL."
  end if

  set primaryURL to item 1 of argv
  set equivalentURL to item 2 of argv

  tell application "Microsoft Edge"
    repeat with targetWindow in windows
      repeat with tabIndex from 1 to (count of tabs of targetWindow)
        set currentURL to URL of tab tabIndex of targetWindow
        if currentURL starts with primaryURL or currentURL starts with equivalentURL then
          set active tab index of targetWindow to tabIndex
          set index of targetWindow to 1
          activate
          return
        end if
      end repeat
    end repeat

    open location primaryURL
    activate
  end tell
end run
