import ExpoModulesCore
import MapKit

// Apple's own place search and driving directions, used when Odomap's
// server can't offer Google. Apple only allows these results on an Apple
// map, so the app switches its map to Apple Maps while they're on screen.
public class OdomapAppleMapsModule: Module {
  public func definition() -> ModuleDefinition {
    Name("OdomapAppleMaps")

    AsyncFunction("searchPlaces") { (query: String, near: Coordinate?) async throws -> [[String: Any]] in
      let request = MKLocalSearch.Request()
      request.naturalLanguageQuery = query
      request.resultTypes = [.address, .pointOfInterest]
      if let near {
        request.region = MKCoordinateRegion(
          center: near.clCoordinate,
          latitudinalMeters: 100_000,
          longitudinalMeters: 100_000
        )
      }
      let response = try await MKLocalSearch(request: request).start()
      return response.mapItems.prefix(8).map { item in
        let place = describe(item)
        return [
          "title": item.name ?? place.address,
          "subtitle": place.address,
          "latitude": place.coordinate.latitude,
          "longitude": place.coordinate.longitude,
        ]
      }
    }

    AsyncFunction("planRoutes") { (from: Coordinate, to: Coordinate, avoidHighways: Bool) async throws -> [[String: Any]] in
      let request = MKDirections.Request()
      request.source = mapItem(at: from.clCoordinate)
      request.destination = mapItem(at: to.clCoordinate)
      request.transportType = .automobile
      request.requestsAlternateRoutes = true
      request.highwayPreference = avoidHighways ? .avoid : .any
      let response = try await MKDirections(request: request).calculate()
      return response.routes.map { route in
        let line = route.polyline
        var points = [CLLocationCoordinate2D](repeating: kCLLocationCoordinate2DInvalid, count: line.pointCount)
        line.getCoordinates(&points, range: NSRange(location: 0, length: line.pointCount))
        return [
          "coordinates": points.map { [$0.latitude, $0.longitude] },
          "distanceMeters": route.distance,
          "durationSeconds": route.expectedTravelTime,
        ]
      }
    }
  }
}

struct Coordinate: Record {
  @Field var latitude: Double = 0
  @Field var longitude: Double = 0

  var clCoordinate: CLLocationCoordinate2D {
    CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
  }
}

// MKPlacemark is deprecated from iOS 26 in favor of location/address, but
// the app still supports iOS 16.4, so pick whichever this phone has.
private func mapItem(at coordinate: CLLocationCoordinate2D) -> MKMapItem {
  if #available(iOS 26.0, *) {
    return MKMapItem(location: CLLocation(latitude: coordinate.latitude, longitude: coordinate.longitude), address: nil)
  }
  return MKMapItem(placemark: MKPlacemark(coordinate: coordinate))
}

private func describe(_ item: MKMapItem) -> (coordinate: CLLocationCoordinate2D, address: String) {
  if #available(iOS 26.0, *) {
    let address = item.address?.shortAddress ?? item.address?.fullAddress ?? ""
    return (item.location.coordinate, address)
  }
  return (item.placemark.coordinate, item.placemark.title ?? "")
}
