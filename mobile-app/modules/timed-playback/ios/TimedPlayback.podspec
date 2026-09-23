Pod::Spec.new do |s|
  s.name = 'TimedPlayback'
  s.version = '1.0.0'
  s.summary = 'Source-time playback boundaries for DuolinTing'
  s.description = s.summary
  s.license = 'Apache-2.0'
  s.author = 'DuolinTing'
  s.homepage = 'https://expo.dev'
  s.platforms = { :ios => '15.1', :tvos => '15.1' }
  s.source = { :path => '.' }
  s.static_framework = true
  s.swift_version = '5.9'
  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.swift'
end
