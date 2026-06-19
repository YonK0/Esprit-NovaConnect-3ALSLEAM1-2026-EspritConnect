package tn.esprit.connect.modules.profile.mapper;

import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import org.mapstruct.Named;
import tn.esprit.connect.modules.profile.dto.ProfileResponse;
import tn.esprit.connect.modules.profile.entity.Profile;
import tn.esprit.connect.modules.profile.entity.Promotion;
import tn.esprit.connect.modules.profile.entity.Specialty;

@Mapper(componentModel = "spring")
public interface ProfileMapper {

    @Mapping(target = "userId", source = "user.id")
    @Mapping(target = "promotionYear", source = "promotion", qualifiedByName = "promotionYear")
    @Mapping(target = "specialtyCode", source = "specialty", qualifiedByName = "specialtyCode")
    @Mapping(target = "specialtyName", source = "specialty", qualifiedByName = "specialtyName")
    @Mapping(target = "openToWork", source = "user.openToWork")
    @Mapping(target = "identityVerified", source = "user.identityVerified")
    ProfileResponse toResponse(Profile profile);

    @Named("promotionYear")
    default Integer promotionYear(Promotion p) { return p == null ? null : p.getYear(); }

    @Named("specialtyCode")
    default String specialtyCode(Specialty s) { return s == null ? null : s.getCode(); }

    @Named("specialtyName")
    default String specialtyName(Specialty s) { return s == null ? null : s.getName(); }
}
