Pod::Spec.new do |s|
  s.name = 'TimedPlayback'
  s.version = '1.0.0'
  s.summary = 'Source-time playback boundaries for DuolinTing'
  s.description = s.summary
  s.license = 'Apache-2.0'
  s.author = 'DuolinTing'
  s.homepage = 'https://expo.dev'
  # Match SDK 58's ExpoModulesCore minimum so Swift can import its native API.
  s.platforms = { :ios => '16.4', :tvos => '16.4' }
  s.source = { :path => '.' }
  s.static_framework = true
  s.swift_version = '5.9'
  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.swift'
end
