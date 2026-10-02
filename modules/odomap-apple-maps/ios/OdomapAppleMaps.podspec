Pod::Spec.new do |s|
  s.name           = 'OdomapAppleMaps'
  s.version        = '1.0.0'
  s.summary        = 'Apple place search and routing for Odomap'
  s.description    = 'Apple place search and routing for Odomap, used when Google is unavailable'
  s.author         = ''
  s.homepage       = 'https://abhinayreddygurrala.github.io/BIKEAPP/'
  s.platforms      = {
    :ios => '16.4'
  }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = "**/*.{h,m,swift}"
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
