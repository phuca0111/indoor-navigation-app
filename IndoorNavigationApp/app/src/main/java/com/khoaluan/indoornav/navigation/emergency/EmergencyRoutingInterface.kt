package com.khoaluan.indoornav.navigation.emergency

import com.khoaluan.indoornav.data.model.Poi
import com.khoaluan.indoornav.navigation.graph.AStarPathfinder
import com.khoaluan.indoornav.navigation.graph.MultiFloorPathPlanner
import com.khoaluan.indoornav.navigation.graph.SafePoiLocator

/**
 * P2.4 — Surface Phase 3 gọi được; không coupling trực tiếp tới ViewModel / Policy.
 */
interface EmergencyRoutingInterface {
    fun findPath(
        startNodeId: String,
        goalNodeId: String,
        blockedNodeIds: Set<String> = emptySet(),
        blockedEdgeKeys: Set<String> = emptySet(),
    ): AStarPathfinder.PathResult?

    fun findNearestExit(
        startNodeId: String,
        pois: List<Poi>,
        blockedNodeIds: Set<String> = emptySet(),
        blockedEdgeKeys: Set<String> = emptySet(),
    ): SafePoiLocator.SafePoiCandidate?

    fun findNearestSafePoi(
        startNodeId: String,
        pois: List<Poi>,
        kinds: Set<SafePoiLocator.SafeKind> = setOf(
            SafePoiLocator.SafeKind.EXIT,
            SafePoiLocator.SafeKind.ASSEMBLY_POINT,
            SafePoiLocator.SafeKind.SAFETY,
        ),
        blockedNodeIds: Set<String> = emptySet(),
        blockedEdgeKeys: Set<String> = emptySet(),
    ): SafePoiLocator.SafePoiCandidate?

    fun planMultiFloor(
        startFloor: Int,
        destFloor: Int,
        startNodeId: String,
        destNodeId: String,
        blockedNodeIds: Set<String> = emptySet(),
        blockedEdgeKeys: Set<String> = emptySet(),
        avoidConnectorKinds: Set<com.khoaluan.indoornav.navigation.instruction.FloorTransitionDetector.ConnectorHint.Kind> = emptySet(),
    ): MultiFloorPathPlanner.Plan?
}
